import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization';
import Product from '../models/Product';
import { VERIFICATION_GATED_CLASSES, VerificationStatus } from '../config/medical';

// Changing any of these after verification means an admin checked different
// details than the ones now shown to buyers, so verification is reset.
export const IDENTITY_FIELDS = ['name', 'type', 'province', 'city', 'mdelNumber'] as const;

export class VerificationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// The single place verification status changes. Records an audit event and
// keeps verification-gated listings (Class III) in step: suspended when the
// organization stops being verified, restored when it is verified again.
export async function changeVerificationStatus(
  org: IOrganization,
  status: VerificationStatus,
  by: string | Types.ObjectId,
  note?: string
): Promise<IOrganization> {
  const wasVerified = org.verificationStatus === 'verified';

  org.verificationStatus = status;
  org.verificationNote = note;
  org.verifiedAt = status === 'verified' ? new Date() : undefined;
  org.verificationHistory.push({ status, at: new Date(), by: new Types.ObjectId(String(by)), note });
  await org.save();

  const gated = { organization: org._id, deviceClass: { $in: VERIFICATION_GATED_CLASSES } };
  if (wasVerified && status !== 'verified') {
    await Product.updateMany(gated, { suspended: true });
  } else if (!wasVerified && status === 'verified') {
    await Product.updateMany(gated, { suspended: false });
  }
  return org;
}

export async function requestVerification(org: IOrganization, by: string): Promise<IOrganization> {
  if (org.verificationStatus === 'pending') throw new VerificationError('Verification is already under review', 409);
  if (org.verificationStatus === 'verified') throw new VerificationError('Organization is already verified', 409);
  if (!org.documents.length) {
    throw new VerificationError('Upload at least one supporting document before requesting verification');
  }
  if (org.type === 'dealer' && !org.mdelNumber) {
    throw new VerificationError('Dealers must provide their Health Canada MDEL number');
  }
  return changeVerificationStatus(org, 'pending', by);
}

export async function approve(orgId: string, adminId: string): Promise<IOrganization> {
  const org = await findOrg(orgId);
  if (org.verificationStatus !== 'pending') {
    throw new VerificationError('Only organizations awaiting review can be verified', 409);
  }
  return changeVerificationStatus(org, 'verified', adminId);
}

// Rejects a pending request, or revokes an existing verification.
export async function reject(orgId: string, adminId: string, note: unknown): Promise<IOrganization> {
  const reason = typeof note === 'string' ? note.trim() : '';
  if (!reason) throw new VerificationError('A reason is required so the seller knows what to fix');
  const org = await findOrg(orgId);
  if (org.verificationStatus !== 'pending' && org.verificationStatus !== 'verified') {
    throw new VerificationError('Only pending or verified organizations can be rejected', 409);
  }
  return changeVerificationStatus(org, 'rejected', adminId, reason);
}

async function findOrg(orgId: string): Promise<IOrganization> {
  const org = Types.ObjectId.isValid(orgId) ? await Organization.findById(orgId) : null;
  if (!org) throw new VerificationError('Organization not found', 404);
  return org;
}

// Identifies an uploaded file by its leading bytes instead of trusting the
// client-supplied Content-Type or file extension.
export function detectDocumentType(head: Buffer): string | null {
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  return null;
}
