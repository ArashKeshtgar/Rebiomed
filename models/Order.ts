import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IOrderItem {
  product: Types.ObjectId;
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

export interface IOrder extends Document {
  user: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  totalCents: number;
  currency: string;
  stripePaymentIntentId?: string;
  status: OrderStatus;
  createdAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  title: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true }
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [OrderItemSchema], required: true },
  subtotal: { type: Number, required: true },
  shipping: { type: Number, required: true },
  total: { type: Number, required: true },
  totalCents: { type: Number, required: true },
  currency: { type: String, required: true },
  stripePaymentIntentId: { type: String, unique: true, sparse: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IOrder>('Order', OrderSchema);
