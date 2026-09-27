import mongoose, { Schema, Document, Types } from 'mongoose';

// pending   -> buyer made the offer, waiting for the seller
// countered -> seller proposed a different price, waiting for the buyer
// accepted  -> a price was agreed; the buyer can check out at it until acceptedUntil
// used      -> an order was paid at the agreed price (usedByOrder)
// declined / withdrawn / expired -> closed
export type OfferStatus = 'pending' | 'countered' | 'accepted' | 'used' | 'declined' | 'withdrawn' | 'expired';

export const OPEN_OFFER_STATUSES: readonly OfferStatus[] = ['pending', 'countered', 'accepted'];

export interface IOffer extends Document {
  product: Types.ObjectId;
  organization: Types.ObjectId;
  buyer: Types.ObjectId;
  amountCents: number;
  message?: string;
  counterAmountCents?: number;
  agreedAmountCents?: number;
  sellerNote?: string;
  status: OfferStatus;
  // Deadline to respond while pending or countered.
  expiresAt: Date;
  // Deadline to check out once accepted.
  acceptedUntil?: Date;
  usedByOrder?: Types.ObjectId;
  // "<buyer>:<product>" while the offer is open, removed when it closes. A
  // unique sparse index on it means a buyer can have only one open offer per
  // listing, even if two requests race.
  openKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OfferSchema = new Schema<IOffer>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amountCents: { type: Number, required: true, min: 1 },
  message: { type: String, trim: true, maxlength: 1000 },
  counterAmountCents: { type: Number, min: 1 },
  agreedAmountCents: { type: Number, min: 1 },
  sellerNote: { type: String, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['pending', 'countered', 'accepted', 'used', 'declined', 'withdrawn', 'expired'],
    default: 'pending'
  },
  expiresAt: { type: Date, required: true },
  acceptedUntil: { type: Date },
  usedByOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
  openKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

OfferSchema.index({ buyer: 1, product: 1, status: 1 });
OfferSchema.index({ organization: 1, status: 1, createdAt: -1 });

export default mongoose.model<IOffer>('Offer', OfferSchema);
