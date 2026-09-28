import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  CHECK_RESULTS,
  CheckResult,
  INSPECTION_CHECKS,
  INSPECTION_OUTCOMES,
  InspectionCheck,
  InspectionOutcome
} from '../config/medical';

// requested -> seller asked an inspector organization, waiting for it to answer
// accepted  -> inspector took the job and is arranging the visit
// completed -> report submitted; it is public on the listing whatever the outcome
// declined / cancelled -> closed without a report
export type InspectionStatus = 'requested' | 'accepted' | 'completed' | 'declined' | 'cancelled';

export interface IInspectionCheckResult {
  item: InspectionCheck;
  result: CheckResult;
  notes?: string;
}

export interface IInspectionReport {
  inspectedAt: Date;
  technicianName: string;
  // e.g. "CET, CBET" or "P.Eng." — the qualification the technician signs under.
  credential: string;
  // Read off the device on site, so the report is tied to that unit.
  serialNumber: string;
  checks: IInspectionCheckResult[];
  outcome: InspectionOutcome;
  summary: string;
  // Optional signed report or test printout (PDF/PNG/JPEG), stored privately.
  attachment?: { originalName: string; storedName: string; mimeType: string; size: number };
  submittedBy: Types.ObjectId;
  submittedAt: Date;
}

export interface IInspection extends Document {
  product: Types.ObjectId;
  sellerOrganization: Types.ObjectId;
  inspectorOrganization: Types.ObjectId;
  requestedBy: Types.ObjectId;
  requestNote?: string;
  declineNote?: string;
  status: InspectionStatus;
  report?: IInspectionReport;
  // The product id while the request is open, removed when it closes. A unique
  // sparse index on it allows only one open request per listing.
  openKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CheckResultSchema = new Schema<IInspectionCheckResult>({
  item: { type: String, enum: INSPECTION_CHECKS, required: true },
  result: { type: String, enum: CHECK_RESULTS, required: true },
  notes: { type: String, trim: true, maxlength: 1000 }
}, { _id: false });

const ReportSchema = new Schema<IInspectionReport>({
  inspectedAt: { type: Date, required: true },
  technicianName: { type: String, required: true, trim: true },
  credential: { type: String, required: true, trim: true },
  serialNumber: { type: String, required: true, trim: true },
  checks: { type: [CheckResultSchema], required: true },
  outcome: { type: String, enum: INSPECTION_OUTCOMES, required: true },
  summary: { type: String, required: true, trim: true, maxlength: 4000 },
  attachment: {
    type: new Schema({
      originalName: { type: String, required: true },
      storedName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true }
    }, { _id: false }),
    default: undefined
  },
  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date, required: true }
}, { _id: false });

const InspectionSchema = new Schema<IInspection>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  sellerOrganization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  inspectorOrganization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestNote: { type: String, trim: true, maxlength: 1000 },
  declineNote: { type: String, trim: true, maxlength: 1000 },
  status: {
    type: String,
    enum: ['requested', 'accepted', 'completed', 'declined', 'cancelled'],
    default: 'requested'
  },
  report: { type: ReportSchema, default: undefined },
  openKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

// storedName is an internal path detail; never send it to clients.
InspectionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { openKey: _key, ...visible } = ret as Record<string, any>;
    if (visible.report?.attachment) {
      const { storedName: _hidden, ...attachment } = visible.report.attachment;
      visible.report = { ...visible.report, attachment };
    }
    return visible;
  }
});

InspectionSchema.index({ product: 1, status: 1, 'report.inspectedAt': -1 });
InspectionSchema.index({ inspectorOrganization: 1, status: 1, createdAt: -1 });
InspectionSchema.index({ sellerOrganization: 1, createdAt: -1 });

export default mongoose.model<IInspection>('Inspection', InspectionSchema);
