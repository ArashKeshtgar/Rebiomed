import { Types } from 'mongoose';
import Inspection, { IInspection, IInspectionCheckResult, IInspectionReport, InspectionStatus } from '../models/Inspection';
import Organization, { IOrganization } from '../models/Organization';
import Product from '../models/Product';
import {
  CHECK_RESULTS,
  INSPECTION_CHECKS,
  INSPECTION_OUTCOMES,
  INSPECTION_VALID_DAYS,
  InspectionOutcome
} from '../config/medical';
import { organizationOf } from './offers';

// Independent inspections of listed equipment. A seller picks a verified
// biomedical service provider other than itself; that provider accepts, visits
// and files a structured report, which is published on the listing whatever
// the outcome. Each step is one conditional update on the current status, as
// with offers and fulfillment.

export class InspectionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const DAY = 24 * 60 * 60 * 1000;

// Only verified biomedical service providers may inspect.
export const isEligibleInspector = (org: Pick<IOrganization, 'type' | 'verificationStatus'>): boolean =>
  org.type === 'service_provider' && org.verificationStatus === 'verified';

export const INSPECTOR_PUBLIC_FIELDS = 'name type province city website verificationStatus';

export async function listInspectors(province?: unknown): Promise<IOrganization[]> {
  const filter: Record<string, unknown> = { type: 'service_provider', verificationStatus: 'verified' };
  if (typeof province === 'string' && province) filter.province = province;
  return Organization.find(filter).select(INSPECTOR_PUBLIC_FIELDS).sort('province name');
}

const text = (value: unknown, max: number, label: string): string | undefined => {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t.length > max) throw new InspectionError(`${label} is too long`);
  return t || undefined;
};

export async function requestInspection(
  userId: string, productId: unknown, inspectorOrgId: unknown, note: unknown
): Promise<IInspection> {
  const pid = String(productId ?? '');
  const product = Types.ObjectId.isValid(pid) ? await Product.findById(pid) : null;
  const sellerOrgId = await organizationOf(userId);
  // 404 for someone else's listing, so it isn't revealed which ids exist.
  if (!product || !sellerOrgId || product.organization.toString() !== sellerOrgId) {
    throw new InspectionError('Listing not found', 404);
  }
  if (product.stock < 1) throw new InspectionError('This listing is sold out', 409);

  const iid = String(inspectorOrgId ?? '');
  const inspector = Types.ObjectId.isValid(iid) ? await Organization.findById(iid) : null;
  if (!inspector || !isEligibleInspector(inspector)) {
    throw new InspectionError('Choose a verified biomedical service provider as the inspector');
  }
  if (inspector.id === sellerOrgId) {
    throw new InspectionError('An inspection must be done by an organization other than the seller');
  }

  try {
    return await Inspection.create({
      product: product._id,
      sellerOrganization: sellerOrgId,
      inspectorOrganization: inspector._id,
      requestedBy: userId,
      requestNote: text(note, 1000, 'Note'),
      openKey: product.id
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new InspectionError('This listing already has an open inspection request', 409);
    }
    throw err;
  }
}

// Applies an update if the request is in one of `from` statuses and belongs to
// `owner`; otherwise explains why (404 if not theirs, 409 if wrong state).
async function transition(
  id: string,
  owner: { sellerOrganization?: string; inspectorOrganization?: string },
  from: InspectionStatus[],
  update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
  action: string
): Promise<IInspection> {
  if (!Types.ObjectId.isValid(id)) throw new InspectionError('Inspection not found', 404);
  const updated = await Inspection.findOneAndUpdate(
    { _id: id, ...owner, status: { $in: from } }, update, { new: true }
  );
  if (updated) return updated;

  const existing = await Inspection.findOne({ _id: id, ...owner });
  if (!existing) throw new InspectionError('Inspection not found', 404);
  throw new InspectionError(`Cannot ${action} an inspection that is ${existing.status}`, 409);
}

const close = (status: InspectionStatus, set: Record<string, unknown> = {}) =>
  ({ $set: { status, ...set }, $unset: { openKey: '' as const } });

// ---- seller ----------------------------------------------------------------

export const cancelRequest = (id: string, sellerOrgId: string) =>
  transition(id, { sellerOrganization: sellerOrgId }, ['requested', 'accepted'], close('cancelled'), 'cancel');

// Closes any open request on a listing that is being removed.
export async function cancelOpenForProduct(productId: Types.ObjectId | string): Promise<void> {
  await Inspection.updateMany(
    { product: productId, status: { $in: ['requested', 'accepted'] } },
    { $set: { status: 'cancelled' }, $unset: { openKey: '' } }
  );
}

// ---- inspector -------------------------------------------------------------

async function requireEligible(orgId: string): Promise<void> {
  const org = await Organization.findById(orgId);
  if (!org || !isEligibleInspector(org)) {
    throw new InspectionError('Only verified biomedical service providers can take inspections', 403);
  }
}

export async function acceptRequest(id: string, inspectorOrgId: string): Promise<IInspection> {
  await requireEligible(inspectorOrgId);
  return transition(id, { inspectorOrganization: inspectorOrgId }, ['requested'],
    { $set: { status: 'accepted' } }, 'accept');
}

export const declineRequest = (id: string, inspectorOrgId: string, note: unknown) =>
  transition(id, { inspectorOrganization: inspectorOrgId }, ['requested', 'accepted'],
    close('declined', { declineNote: text(note, 1000, 'Note') }), 'decline');

type ReportFields = Omit<IInspectionReport, 'attachment' | 'submittedBy' | 'submittedAt'>;

// Validates a submitted report. Fields may arrive as multipart strings, with
// `checks` as a JSON string. Throws with a user-facing message on bad input.
export function parseReport(body: Record<string, unknown>, requestedAt: Date): ReportFields {
  const required = (key: string, label: string, max = 200): string => {
    const value = text(body[key], max, label);
    if (!value) throw new InspectionError(`${label} is required`);
    return value;
  };

  const inspectedAt = new Date(String(body.inspectedAt ?? ''));
  if (Number.isNaN(inspectedAt.getTime())) throw new InspectionError('Inspection date is invalid');
  // A date-only value is UTC midnight of the inspector's local date, and in
  // Canada the local date can be a calendar day behind UTC (an evening request
  // in Vancouver is stamped the next day in UTC). So compare calendar days, with
  // one day of slack, rather than instants.
  if (inspectedAt.getTime() > Date.now() + DAY) throw new InspectionError('Inspection date is in the future');
  const requestedDay = Date.UTC(requestedAt.getUTCFullYear(), requestedAt.getUTCMonth(), requestedAt.getUTCDate());
  if (inspectedAt.getTime() < requestedDay - DAY) {
    throw new InspectionError('Inspection date is before the inspection was requested');
  }

  let raw: unknown = body.checks;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new InspectionError('Checks must be a list');
    }
  }
  if (!Array.isArray(raw)) throw new InspectionError('Checks must be a list');

  const byItem = new Map<string, IInspectionCheckResult>();
  for (const c of raw) {
    const item = c?.item;
    if (!(INSPECTION_CHECKS as readonly string[]).includes(item)) throw new InspectionError(`Unknown check: ${item}`);
    if (byItem.has(item)) throw new InspectionError(`Check listed twice: ${item}`);
    if (!(CHECK_RESULTS as readonly string[]).includes(c?.result)) throw new InspectionError(`Invalid result for ${item}`);
    const notes = text(c?.notes, 1000, `Notes for ${item}`);
    if (c.result === 'fail' && !notes) throw new InspectionError(`Explain the failed check: ${item}`);
    byItem.set(item, { item, result: c.result, notes });
  }
  const missing = INSPECTION_CHECKS.filter(i => !byItem.has(i));
  if (missing.length) throw new InspectionError(`Missing checks: ${missing.join(', ')}`);
  const checks = INSPECTION_CHECKS.map(i => byItem.get(i)!);

  const outcome = body.outcome as InspectionOutcome;
  if (!(INSPECTION_OUTCOMES as readonly string[]).includes(outcome)) {
    throw new InspectionError(`Outcome must be one of: ${INSPECTION_OUTCOMES.join(', ')}`);
  }
  const failed = checks.filter(c => c.result === 'fail');
  if (outcome === 'pass' && failed.length) {
    throw new InspectionError('A device with failed checks cannot pass outright; use "pass with findings" or "fail"');
  }
  if (failed.some(c => c.item === 'electrical_safety') && outcome !== 'fail') {
    throw new InspectionError('A device that fails electrical safety testing must fail the inspection');
  }

  return {
    inspectedAt,
    technicianName: required('technicianName', 'Technician name'),
    credential: required('credential', 'Credential'),
    serialNumber: required('serialNumber', 'Serial number', 100),
    checks,
    outcome,
    summary: required('summary', 'Summary', 4000)
  };
}

export async function submitReport(
  id: string,
  inspectorOrgId: string,
  userId: string,
  body: Record<string, unknown>,
  attachment?: IInspectionReport['attachment']
): Promise<IInspection> {
  await requireEligible(inspectorOrgId);
  const existing = Types.ObjectId.isValid(id)
    ? await Inspection.findOne({ _id: id, inspectorOrganization: inspectorOrgId })
    : null;
  if (!existing) throw new InspectionError('Inspection not found', 404);

  const fields = parseReport(body, existing.createdAt);
  const report: IInspectionReport = {
    ...fields, attachment, submittedBy: new Types.ObjectId(userId), submittedAt: new Date()
  };
  const done = await transition(id, { inspectorOrganization: inspectorOrgId }, ['accepted'],
    close('completed', { report }), 'file a report for');

  // Publish on the listing unless a more recent inspection is already shown.
  const inspector = await Organization.findById(inspectorOrgId).select('name');
  await Product.updateOne(
    {
      _id: done.product,
      $or: [{ inspection: { $exists: false } }, { 'inspection.inspectedAt': { $lte: report.inspectedAt } }]
    },
    {
      $set: {
        inspection: {
          report: done._id,
          outcome: report.outcome,
          inspectedAt: report.inspectedAt,
          validUntil: new Date(report.inspectedAt.getTime() + INSPECTION_VALID_DAYS * DAY),
          inspectorName: inspector?.name ?? 'Inspector'
        }
      }
    }
  );
  return done;
}

// ---- public ----------------------------------------------------------------

// Completed reports for a listing, newest inspection first.
export async function publishedReports(productId: string): Promise<IInspection[]> {
  if (!Types.ObjectId.isValid(productId)) return [];
  return Inspection.find({ product: productId, status: 'completed' })
    .select('-requestNote -declineNote -requestedBy -report.submittedBy')
    .populate('inspectorOrganization', INSPECTOR_PUBLIC_FIELDS)
    .sort('-report.inspectedAt');
}
