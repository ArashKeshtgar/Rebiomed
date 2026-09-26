import { Types } from 'mongoose';
import Order, { IOrder, IOrderItem } from '../models/Order';
import Product from '../models/Product';

export const CURRENCY = 'usd';
export const SHIPPING_CENTS = 499;

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface PricedCart {
  items: IOrderItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

const toCents = (dollars: number): number => Math.round(dollars * 100);

// Prices a cart from the database. The client only says *what* it wants and how
// many; every price comes from the Product collection, never from the request.
export async function priceCart(lines: unknown): Promise<PricedCart> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CheckoutError('Cart is empty');
  }

  const quantities = new Map<string, number>();
  for (const line of lines as CartLine[]) {
    const id = String(line?.productId ?? '');
    const qty = Number(line?.quantity);
    if (!Types.ObjectId.isValid(id)) throw new CheckoutError('Invalid product id');
    if (!Number.isInteger(qty) || qty < 1) throw new CheckoutError('Invalid quantity');
    quantities.set(id, (quantities.get(id) ?? 0) + qty);
  }

  const products = await Product.find({ _id: { $in: [...quantities.keys()] } });
  if (products.length !== quantities.size) {
    throw new CheckoutError('One or more products no longer exist');
  }

  let subtotalCents = 0;
  const items: IOrderItem[] = products.map(p => {
    const quantity = quantities.get(p.id)!;
    if (p.stock < quantity) {
      throw new CheckoutError(`Only ${p.stock} left of "${p.title}"`, 409);
    }
    subtotalCents += toCents(p.price) * quantity;
    return { product: p._id as Types.ObjectId, title: p.title, price: p.price, quantity };
  });

  return {
    items,
    subtotalCents,
    shippingCents: SHIPPING_CENTS,
    totalCents: subtotalCents + SHIPPING_CENTS
  };
}

export async function createPendingOrder(userId: string, cart: PricedCart): Promise<IOrder> {
  return Order.create({
    user: userId,
    items: cart.items,
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
      await refund(paymentIntent.id);
      locked.status = 'refunded';
      return locked.save();
    }
    decremented.push(item);
  }

  locked.status = 'paid';
  return locked.save();
}

export async function markOrderFailed(paymentIntentId: string): Promise<void> {
  await Order.updateOne(
    { stripePaymentIntentId: paymentIntentId, status: 'pending' },
    { status: 'failed' }
  );
}
