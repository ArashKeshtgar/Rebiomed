import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IOrderItem {
  product: Types.ObjectId;
  organization: Types.ObjectId;
  title: string;
  price: number;
  quantity: number;
}

// pending    -> PaymentIntent created, waiting for Stripe to confirm payment
// processing -> payment confirmed, stock being decremented (short-lived lock)
// paid       -> payment confirmed and stock decremented
// failed     -> Stripe reported the payment as failed
// refunded   -> payment succeeded but stock ran out, so the charge was refunded
export type OrderStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';

// Each seller's part of an order moves through its own lifecycle. The buyer's
// money stays with the platform until the buyer confirms delivery (or an admin
// resolves a dispute in the seller's favour); only then is it paid out.
//
// awaiting_payment -> awaiting_shipment -> shipped -> delivered
//                          |                  |
//                          v                  v
//                      cancelled          disputed -> refunded | delivered
export type FulfillmentStatus =
  | 'awaiting_payment' | 'awaiting_shipment' | 'shipped' | 'delivered'
  | 'disputed' | 'cancelled' | 'refunded';

// not_due    -> buyer has not confirmed delivery yet
// pending    -> due, waiting to be sent (e.g. seller has not finished Stripe onboarding)
// processing -> transfer in flight (short-lived lock)
// paid       -> transferred to the seller's Stripe account
// failed     -> Stripe refused the transfer; retried on the next release attempt
export type PayoutStatus = 'not_due' | 'pending' | 'processing' | 'paid' | 'failed';

export interface IFulfillment {
  _id: Types.ObjectId;
  organization: Types.ObjectId;
  subtotalCents: number;
  platformFeeCents: number;
  status: FulfillmentStatus;
  carrier?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelReason?: string;
  refundId?: string;
  dispute?: {
    reason: string;
    openedAt: Date;
    resolution?: 'refund' | 'release';
    note?: string;
    resolvedAt?: Date;
    resolvedBy?: Types.ObjectId;
  };
  payout: {
    status: PayoutStatus;
    amountCents: number;
    transferId?: string;
    paidAt?: Date;
    error?: string;
  };
}

export interface IOrder extends Document {
  user: Types.ObjectId;
  items: IOrderItem[];
  fulfillments: Types.DocumentArray<IFulfillment & Document>;
  subtotal: number;
  shipping: number;
  total: number;
  totalCents: number;
  currency: string;
  stripePaymentIntentId?: string;
  // Charge behind the PaymentIntent; seller transfers are tied to it so they
  // can be created before the funds have settled.
  stripeChargeId?: string;
  status: OrderStatus;
  createdAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  title: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true }
}, { _id: false });

const FulfillmentSchema = new Schema<IFulfillment>({
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  subtotalCents: { type: Number, required: true },
  platformFeeCents: { type: Number, required: true },
  status: {
    type: String,
    enum: ['awaiting_payment', 'awaiting_shipment', 'shipped', 'delivered', 'disputed', 'cancelled', 'refunded'],
    default: 'awaiting_payment'
  },
  carrier: { type: String, trim: true },
  trackingNumber: { type: String, trim: true },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  cancelReason: { type: String, trim: true },
  refundId: { type: String },
  dispute: {
    type: new Schema({
      reason: { type: String, required: true, trim: true },
      openedAt: { type: Date, required: true },
      resolution: { type: String, enum: ['refund', 'release'] },
      note: { type: String, trim: true },
      resolvedAt: { type: Date },
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    }, { _id: false }),
    default: undefined
  },
  payout: {
    status: { type: String, enum: ['not_due', 'pending', 'processing', 'paid', 'failed'], default: 'not_due' },
    amountCents: { type: Number, required: true },
    transferId: { type: String },
    paidAt: { type: Date },
    error: { type: String }
  }
});

const OrderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [OrderItemSchema], required: true },
  fulfillments: { type: [FulfillmentSchema], default: [] },
  subtotal: { type: Number, required: true },
  shipping: { type: Number, required: true },
  total: { type: Number, required: true },
  totalCents: { type: Number, required: true },
  currency: { type: String, required: true },
  stripePaymentIntentId: { type: String, unique: true, sparse: true },
  stripeChargeId: { type: String },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

OrderSchema.index({ 'fulfillments.organization': 1, createdAt: -1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
