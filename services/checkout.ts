import { Types } from 'mongoose';
import Order, { IOrder, IOrderItem } from '../models/Order';
import Product from '../models/Product';
import keys from '../config/keys';
import { claimOffers, releaseOffers, usableOffer } from './offers';

export const CURRENCY = 'cad';
// Medical equipment ships by freight arranged between buyer and seller, so the
// platform does not add a shipping charge.
export const SHIPPING_CENTS = 0;

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface CartLine {
  productId: string;
  quantity: number;
  // An accepted offer to check out at its agreed price (one unit).
  offerId?: string;
}

export interface PricedFulfillment {
  organization: Types.ObjectId;
  subtotalCents: number;
  platformFeeCents: number;
}

export interface PricedCart {
  items: IOrderItem[];
  // One per seller in the cart.
  fulfillments: PricedFulfillment[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

const toCents = (dollars: number): number => Math.round(dollars * 100);

export const platformFeeFor = (subtotalCents: number): number =>
  Math.round((subtotalCents * keys.platformFeeBps) / 10000);

// Prices a cart from the database. The client only says *what* it wants and how
// many; every price comes from the Product collection (or, for a line with an
// offerId, from that buyer's accepted offer), never from the request.
export async function priceCart(lines: unknown, buyerId?: string): Promise<PricedCart> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CheckoutError('Cart is empty');
  }

  const quantities = new Map<string, number>();
  const offerIds = new Map<string, string>();
  for (const line of lines as CartLine[]) {
    const id = String(line?.productId ?? '');
    const qty = Number(line?.quantity);
    if (!Types.ObjectId.isValid(id)) throw new CheckoutError('Invalid product id');
    if (!Number.isInteger(qty) || qty < 1) throw new CheckoutError('Invalid quantity');
    if (line?.offerId !== undefined || offerIds.has(id)) {
      // An offer covers exactly one unit, bought on its own line.
      if (qty !== 1 || quantities.has(id)) {
        throw new CheckoutError('An offer covers one unit; remove other quantities of that item from the cart');
      }
      offerIds.set(id, String(line.offerId));
    }
    quantities.set(id, (quantities.get(id) ?? 0) + qty);
  }

  // Agreed price in cents for each product bought through an offer.
  const offerPrices = new Map<string, { cents: number; offer: Types.ObjectId }>();
  for (const [productId, offerId] of offerIds) {
    const offer = buyerId ? await usableOffer(offerId, buyerId, productId) : null;
    if (!offer) throw new CheckoutError('That offer is no longer available; it may have expired or been withdrawn');
    offerPrices.set(productId, { cents: offer.agreedAmountCents!, offer: offer._id as Types.ObjectId });
  }

  const products = await Product.find({ _id: { $in: [...quantities.keys()] }, suspended: { $ne: true } });
  if (products.length !== quantities.size) {
    throw new CheckoutError('One or more products no longer exist');
  }

  let subtotalCents = 0;
  const items: IOrderItem[] = products.map(p => {
    const quantity = quantities.get(p.id)!;
    if (p.stock < quantity) {
      throw new CheckoutError(`Only ${p.stock} left of "${p.title}"`, 409);
    }
    const offered = offerPrices.get(p.id);
    const unitCents = offered ? offered.cents : toCents(p.price);
    subtotalCents += unitCents * quantity;
    return {
      product: p._id as Types.ObjectId,
      organization: p.organization,
      title: p.title,
      price: unitCents / 100,
      quantity,
      ...(offered ? { offer: offered.offer } : {})
    };
  });

  const bySeller = new Map<string, PricedFulfillment>();
  for (const item of items) {
    const key = item.organization.toString();
    const f = bySeller.get(key) ?? { organization: item.organization, subtotalCents: 0, platformFeeCents: 0 };
    f.subtotalCents += toCents(item.price) * item.quantity;
    bySeller.set(key, f);
  }
  const fulfillments = [...bySeller.values()].map(f => ({ ...f, platformFeeCents: platformFeeFor(f.subtotalCents) }));

  return {
    items,
    fulfillments,
    subtotalCents,
    shippingCents: SHIPPING_CENTS,
    totalCents: subtotalCents + SHIPPING_CENTS
  };
}

export async function createPendingOrder(userId: string, cart: PricedCart): Promise<IOrder> {
  return Order.create({
    user: userId,
    items: cart.items,
    fulfillments: cart.fulfillments.map(f => ({
      ...f,
      status: 'awaiting_payment',
      payout: { status: 'not_due', amountCents: f.subtotalCents - f.platformFeeCents }
    })),
    subtotal: cart.subtotalCents / 100,
    shipping: cart.shippingCents / 100,
    total: cart.totalCents / 100,
    totalCents: cart.totalCents,
    currency: CURRENCY,
    status: 'pending'
  });
}

// The subset of a Stripe PaymentIntent that finalizing an order depends on.
export interface PaymentIntentLike {
  id: string;
  status: string;
  amount: number;
  currency: string;
  latest_charge?: string | { id: string } | null;
}

export type RefundFn = (paymentIntentId: string) => Promise<unknown>;

// Moves a pending order to paid once Stripe confirms the payment. Safe to call
// more than once (webhook and client confirm can race): only the caller that
// wins the pending -> processing transition touches stock.
export async function finalizeOrder(
  orderId: string,
  paymentIntent: PaymentIntentLike,
  refund: RefundFn
): Promise<IOrder> {
  const order = await Order.findById(orderId);
  if (!order) throw new CheckoutError('Order not found', 404);

  if (order.stripePaymentIntentId !== paymentIntent.id) {
    throw new CheckoutError('Payment does not belong to this order');
  }
  if (order.status !== 'pending') return order;

  if (paymentIntent.status !== 'succeeded') {
    throw new CheckoutError('Payment has not succeeded', 402);
  }
  if (paymentIntent.amount !== order.totalCents || paymentIntent.currency !== order.currency) {
    throw new CheckoutError('Payment amount does not match order total');
  }

  const locked = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    { status: 'processing' },
    { new: true }
  );
  if (!locked) return (await Order.findById(orderId))!;

  const refundOrder = async () => {
    await refund(paymentIntent.id);
    locked.status = 'refunded';
    locked.fulfillments.forEach(f => { f.status = 'refunded'; });
    return locked.save();
  };

  // Offers first: if one was already used by another order (the same offer
  // checked out twice), this payment is refunded rather than honoured twice.
  const offerIds = locked.items.filter(i => i.offer).map(i => i.offer!);
  if (!await claimOffers(offerIds, locked._id as Types.ObjectId, locked.createdAt)) {
    return refundOrder();
  }

  const decremented: IOrderItem[] = [];
  for (const item of locked.items) {
    const res = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } }
    );
    if (res.modifiedCount !== 1) {
      await Promise.all(decremented.map(d =>
        Product.updateOne({ _id: d.product }, { $inc: { stock: d.quantity } })
      ));
      await releaseOffers(offerIds, locked._id as Types.ObjectId);
      return refundOrder();
    }
    decremented.push(item);
  }

  const charge = paymentIntent.latest_charge;
  locked.stripeChargeId = typeof charge === 'string' ? charge : charge?.id;
  locked.status = 'paid';
  locked.fulfillments.forEach(f => { f.status = 'awaiting_shipment'; });
  return locked.save();
}

export async function markOrderFailed(paymentIntentId: string): Promise<void> {
  await Order.updateOne(
    { stripePaymentIntentId: paymentIntentId, status: 'pending' },
    { status: 'failed' }
  );
}
