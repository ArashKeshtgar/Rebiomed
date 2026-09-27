import { Types } from 'mongoose';
import Order, { IFulfillment, IOrder } from '../models/Order';
import Organization, { IOrganization } from '../models/Organization';
import Product from '../models/Product';
import keys from '../config/keys';
import { AccountState, stripeOps } from './stripeOps';

// Escrow-style fulfillment: the buyer pays the platform at checkout, each
// seller's share is held until the buyer confirms delivery (or an admin
// resolves a dispute in the seller's favour), and only then transferred to the
// seller's Stripe Connect account, minus the platform fee.
//
// Every state change is a single conditional update on the fulfillment's
// current status, so concurrent requests (double clicks, webhook retries)
// cannot ship, refund or pay out the same fulfillment twice.

export class FulfillmentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Ops = Pick<typeof stripeOps, 'refund' | 'transfer'>;

const MAX_TEXT = 1000;

const requiredText = (value: unknown, what: string): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new FulfillmentError(`${what} is required`);
  if (text.length > MAX_TEXT) throw new FulfillmentError(`${what} is too long`);
  return text;
};

const optionalText = (value: unknown, max = 100): string | undefined => {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || undefined;
};

const positional = (set: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(set).map(([k, v]) => [`fulfillments.$.${k}`, v]));

// Applies `set` to one fulfillment if the order and fulfillment match the
// given conditions. On no match, explains why with the right status code.
async function transition(
  orderId: string,
  fulfillmentId: string,
  conditions: { order?: Record<string, unknown>; fulfillment: Record<string, unknown> },
  set: Record<string, unknown>,
  action: string
): Promise<IOrder> {
  if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(fulfillmentId)) {
    throw new FulfillmentError('Order not found', 404);
  }
  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: 'paid',
      ...conditions.order,
      fulfillments: { $elemMatch: { _id: fulfillmentId, ...conditions.fulfillment } }
    },
    { $set: positional(set) },
    { new: true }
  );
  if (updated) return updated;

  // Work out whether the caller can't see this fulfillment (404) or it is in
  // the wrong state for the action (409).
  const order = await Order.findOne({ _id: orderId, ...conditions.order });
  const f = order?.fulfillments.id(fulfillmentId);
  const ownerCheck = { ...conditions.fulfillment };
  delete ownerCheck.status;
  const visible = f && Object.entries(ownerCheck).every(([k, v]) => String(f.get(k)) === String(v));
  if (!order || !f || !visible) throw new FulfillmentError('Order not found', 404);
  throw new FulfillmentError(`Cannot ${action} an order that is ${f.status.replace(/_/g, ' ')}`, 409);
}

const fulfillmentIn = (order: IOrder, fulfillmentId: string): IFulfillment =>
  order.fulfillments.id(fulfillmentId)!;

// Puts back the stock of one seller's items in an order.
async function restock(order: IOrder, organization: Types.ObjectId): Promise<void> {
  await Promise.all(order.items
    .filter(i => i.organization.equals(organization))
    .map(i => Product.updateOne({ _id: i.product }, { $inc: { stock: i.quantity } })));
}

// ---- seller actions ------------------------------------------------------

export async function markShipped(
  orderId: string, fulfillmentId: string, organizationId: string,
  details: { carrier?: unknown; trackingNumber?: unknown }
): Promise<IOrder> {
  return transition(orderId, fulfillmentId,
    { fulfillment: { organization: organizationId, status: 'awaiting_shipment' } },
    {
      status: 'shipped',
      carrier: optionalText(details.carrier),
      trackingNumber: optionalText(details.trackingNumber),
      shippedAt: new Date()
    },
    'ship');
}

// Seller can't or won't ship: refund the buyer for this seller's part only.
export async function cancelBySeller(
  orderId: string, fulfillmentId: string, organizationId: string, reason: unknown, ops: Ops = stripeOps
): Promise<IOrder> {
  const why = requiredText(reason, 'A cancellation reason');
  const order = await transition(orderId, fulfillmentId,
    { fulfillment: { organization: organizationId, status: 'awaiting_shipment' } },
    { status: 'cancelled', cancelReason: why },
    'cancel');
  return refundFulfillment(order, fulfillmentId, 'awaiting_shipment', true, ops);
}

// ---- buyer actions -------------------------------------------------------

export async function confirmDelivery(
  orderId: string, fulfillmentId: string, buyerId: string, ops: Ops = stripeOps
): Promise<IOrder> {
  await transition(orderId, fulfillmentId,
    { order: { user: buyerId }, fulfillment: { status: 'shipped' } },
    { status: 'delivered', deliveredAt: new Date(), 'payout.status': 'pending' },
    'confirm delivery of');
  return tryPayout(orderId, fulfillmentId, ops);
}

export async function openDispute(
  orderId: string, fulfillmentId: string, buyerId: string, reason: unknown
): Promise<IOrder> {
  const why = requiredText(reason, 'A description of the problem');
  return transition(orderId, fulfillmentId,
    { order: { user: buyerId }, fulfillment: { status: { $in: ['awaiting_shipment', 'shipped'] } } },
    { status: 'disputed', dispute: { reason: why, openedAt: new Date() } },
    'report a problem with');
}

// ---- admin actions -------------------------------------------------------

export async function resolveDispute(
  orderId: string, fulfillmentId: string, adminId: string,
  action: unknown, note: unknown, ops: Ops = stripeOps
): Promise<IOrder> {
  if (action !== 'refund' && action !== 'release') {
    throw new FulfillmentError('Action must be "refund" or "release"');
  }
  const why = requiredText(note, 'A resolution note');
  const resolved = {
    'dispute.resolution': action,
    'dispute.note': why,
    'dispute.resolvedAt': new Date(),
    'dispute.resolvedBy': new Types.ObjectId(adminId)
  };

  if (action === 'refund') {
    const order = await transition(orderId, fulfillmentId,
      { fulfillment: { status: 'disputed' } }, { status: 'refunded', ...resolved }, 'refund');
    // Not restocked: whether the equipment came back usable is for the seller
    // to decide by relisting it.
    return refundFulfillment(order, fulfillmentId, 'disputed', false, ops);
  }

  // Ruling for the seller on something never shipped (e.g. "seller isn't
  // answering") means the order carries on, not that the seller gets paid for
  // equipment the buyer never received.
  const order = Types.ObjectId.isValid(orderId) ? await Order.findById(orderId) : null;
  const shipped = !!order?.fulfillments.id(fulfillmentId)?.shippedAt;
  if (!shipped) {
    return transition(orderId, fulfillmentId,
      { fulfillment: { status: 'disputed', shippedAt: { $exists: false } } },
      { status: 'awaiting_shipment', ...resolved },
      'resume');
  }

  await transition(orderId, fulfillmentId,
    { fulfillment: { status: 'disputed', shippedAt: { $exists: true } } },
    { status: 'delivered', deliveredAt: new Date(), 'payout.status': 'pending', ...resolved },
    'release payment for');
  return tryPayout(orderId, fulfillmentId, ops);
}

// Refunds one fulfillment's share. If Stripe refuses, the fulfillment is put
// back in its previous status so the action can be retried.
async function refundFulfillment(
  order: IOrder, fulfillmentId: string, previousStatus: string, putBackStock: boolean, ops: Ops
): Promise<IOrder> {
  const f = fulfillmentIn(order, fulfillmentId);
  try {
    const refund = await ops.refund(order.stripePaymentIntentId!, f.subtotalCents, `refund_${fulfillmentId}`);
    if (putBackStock) await restock(order, f.organization);
    return (await Order.findOneAndUpdate(
      { _id: order._id, 'fulfillments._id': fulfillmentId },
      { $set: { 'fulfillments.$.refundId': refund.id } },
      { new: true }
    ))!;
  } catch (err) {
    await Order.updateOne(
      { _id: order._id, 'fulfillments._id': fulfillmentId },
      { $set: { 'fulfillments.$.status': previousStatus } }
    );
    throw new FulfillmentError(`Refund failed: ${(err as Error).message}`, 502);
  }
}

// ---- payouts -------------------------------------------------------------

// Transfers a delivered fulfillment's share to the seller if it is due and the
// seller can receive it. Leaves it pending if the seller has not finished
// Stripe onboarding; it is retried when they do (releasePendingPayouts).
export async function tryPayout(orderId: string, fulfillmentId: string, ops: Ops = stripeOps): Promise<IOrder> {
  const locked = await Order.findOneAndUpdate(
    {
      _id: orderId,
      fulfillments: {
        $elemMatch: { _id: fulfillmentId, status: 'delivered', 'payout.status': { $in: ['pending', 'failed'] } }
      }
    },
    { $set: { 'fulfillments.$.payout.status': 'processing' } },
    { new: true }
  );
  if (!locked) return (await Order.findById(orderId))!;

  const f = fulfillmentIn(locked, fulfillmentId);
  const setPayout = async (fields: Record<string, unknown>, unset: string[] = []) =>
    (await Order.findOneAndUpdate(
      { _id: orderId, 'fulfillments._id': fulfillmentId },
      {
        $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`fulfillments.$.payout.${k}`, v])),
        ...(unset.length ? { $unset: Object.fromEntries(unset.map(k => [`fulfillments.$.payout.${k}`, ''])) } : {})
      },
      { new: true }
    ))!;

  const org = await Organization.findById(f.organization);
  if (!org?.stripeAccountId || !org.payoutsEnabled) {
    return setPayout({ status: 'pending', error: 'Seller has not finished setting up payouts' });
  }

  try {
    const transfer = await ops.transfer({
      amountCents: f.payout.amountCents,
      destination: org.stripeAccountId,
      transferGroup: `order_${orderId}`,
      sourceTransaction: locked.stripeChargeId,
      metadata: { orderId: String(orderId), fulfillmentId: String(fulfillmentId) }
    }, `payout_${fulfillmentId}`);
    return setPayout({ status: 'paid', transferId: transfer.id, paidAt: new Date() }, ['error']);
  } catch (err) {
    return setPayout({ status: 'failed', error: (err as Error).message });
  }
}

export async function releasePendingPayouts(organizationId: Types.ObjectId | string, ops: Ops = stripeOps): Promise<number> {
  const orders = await Order.find({
    fulfillments: {
      $elemMatch: { organization: organizationId, status: 'delivered', 'payout.status': { $in: ['pending', 'failed'] } }
    }
  });
  let released = 0;
  for (const order of orders) {
    for (const f of order.fulfillments) {
      if (!f.organization.equals(organizationId) || f.status !== 'delivered') continue;
      if (f.payout.status !== 'pending' && f.payout.status !== 'failed') continue;
      const after = await tryPayout(order.id, f._id.toString(), ops);
      if (fulfillmentIn(after, f._id.toString()).payout.status === 'paid') released++;
    }
  }
  return released;
}

// ---- Stripe Connect onboarding --------------------------------------------

type ConnectOps = Pick<typeof stripeOps, 'createExpressAccount' | 'createOnboardingLink' | 'retrieveAccount' | 'transfer' | 'refund'>;

export async function startOnboarding(org: IOrganization, email: string, ops: ConnectOps = stripeOps): Promise<string> {
  if (!org.stripeAccountId) {
    const account = await ops.createExpressAccount(email, org.id);
    applyAccountState(org, account);
    await org.save();
  }
  return ops.createOnboardingLink(
    org.stripeAccountId!,
    `${keys.clientUrl}/organization?stripe=return`,
    `${keys.clientUrl}/organization?stripe=refresh`
  );
}

const applyAccountState = (org: IOrganization, state: AccountState) => {
  org.stripeAccountId = state.id;
  org.stripeDetailsSubmitted = state.detailsSubmitted;
  org.payoutsEnabled = state.payoutsEnabled;
};

// Stores the latest account state and, once payouts are possible, sends any
// payouts that were waiting for the seller to finish onboarding.
export async function syncAccount(org: IOrganization, state: AccountState, ops: Ops = stripeOps): Promise<IOrganization> {
  applyAccountState(org, state);
  await org.save();
  if (org.payoutsEnabled) await releasePendingPayouts(org._id as Types.ObjectId, ops);
  return org;
}
