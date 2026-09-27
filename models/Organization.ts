import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  DOCUMENT_KINDS,
  DocumentKind,
  ORGANIZATION_TYPES,
  OrganizationType,
  PROVINCES,
  Province,
  VERIFICATION_STATUSES,
  VerificationStatus
} from '../config/medical';

// A file an organization uploads to prove who it is (MDEL licence, business
// registration...). Stored under keys.privateUploadDir, never served statically.
export interface IVerificationDocument {
  _id: Types.ObjectId;
  kind: DocumentKind;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

// One entry per verification status change, so decisions can be audited.
export interface IVerificationEvent {
  status: VerificationStatus;
  at: Date;
  by: Types.ObjectId;
  note?: string;
}

// The clinic, hospital, dealer or service company a user buys and sells on behalf of.
export interface IOrganization extends Document {
  name: string;
  type: OrganizationType;
  province: Province;
  city: string;
  phone?: string;
  website?: string;
  // Health Canada Medical Device Establishment Licence, held by dealers/distributors.
  mdelNumber?: string;
  verificationStatus: VerificationStatus;
  // Latest reason given by an admin when rejecting or revoking.
  verificationNote?: string;
  verifiedAt?: Date;
  documents: Types.DocumentArray<IVerificationDocument & Document>;
  // Stripe Connect (Express) account that receives this organization's payouts.
  stripeAccountId?: string;
  stripeDetailsSubmitted: boolean;
  payoutsEnabled: boolean;
  verificationHistory: IVerificationEvent[];
  owner: Types.ObjectId;
  createdAt: Date;
}

const VerificationDocumentSchema = new Schema<IVerificationDocument>({
  kind: { type: String, enum: DOCUMENT_KINDS, required: true },
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

// storedName is an internal path detail; never send it to clients.
VerificationDocumentSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { storedName: _hidden, ...visible } = ret;
    return visible;
  }
});

const VerificationEventSchema = new Schema<IVerificationEvent>({
  status: { type: String, enum: VERIFICATION_STATUSES, required: true },
  at: { type: Date, default: Date.now },
  by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, trim: true }
}, { _id: false });

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ORGANIZATION_TYPES, required: true },
  province: { type: String, enum: PROVINCES, required: true },
  city: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  mdelNumber: { type: String, trim: true },
  verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'unverified' },
  verificationNote: { type: String, trim: true },
  verifiedAt: { type: Date },
  documents: { type: [VerificationDocumentSchema], default: [] },
  stripeAccountId: { type: String, unique: true, sparse: true },
  stripeDetailsSubmitted: { type: Boolean, default: false },
  payoutsEnabled: { type: Boolean, default: false },
  verificationHistory: { type: [VerificationEventSchema], default: [] },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IOrganization>('Organization', OrganizationSchema);
