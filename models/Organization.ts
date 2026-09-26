import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  ORGANIZATION_TYPES,
  OrganizationType,
  PROVINCES,
  Province,
  VERIFICATION_STATUSES,
  VerificationStatus
} from '../config/medical';

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
  owner: Types.ObjectId;
  createdAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ORGANIZATION_TYPES, required: true },
  province: { type: String, enum: PROVINCES, required: true },
  city: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  mdelNumber: { type: String, trim: true },
  verificationStatus: { type: String, enum: VERIFICATION_STATUSES, default: 'unverified' },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IOrganization>('Organization', OrganizationSchema);
