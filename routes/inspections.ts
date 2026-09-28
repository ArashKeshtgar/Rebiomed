import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Types } from 'mongoose';
import Inspection from '../models/Inspection';
import auth from '../middleware/auth';
import keys from '../config/keys';
import { MAX_DOCUMENT_BYTES } from '../config/medical';
import { detectDocumentType } from '../services/verification';
import { organizationOf } from '../services/offers';
import {
  INSPECTOR_PUBLIC_FIELDS,
  InspectionError,
  acceptRequest,
  cancelRequest,
  declineRequest,
  listInspectors,
  publishedReports,
  requestInspection,
  submitReport
} from '../services/inspections';

const router = express.Router();

const PRODUCT_FIELDS = 'title imageUrl price manufacturer deviceModel deviceClass location';

const sendError = (res: Response, err: unknown) => {
  if (err instanceof InspectionError) return res.status(err.status).json({ msg: err.message });
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

const attachmentUpload = multer({
  dest: keys.privateUploadDir,
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 }
}).single('attachment');

// Runs multer and turns its errors (e.g. file too large) into 400 responses.
const receiveAttachment = (req: Request, res: Response, next: NextFunction) => {
  attachmentUpload(req, res, err => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `File is larger than ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB`
        : err.message;
      return res.status(400).json({ msg });
    }
    if (err) return next(err);
    next();
  });
};

// Runs an action with the caller's organization id, or 404s if they have none.
const withOrg = (action: (req: Request, orgId: string) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      const orgId = await organizationOf(req.user!.id);
      if (!orgId) return res.status(404).json({ msg: 'Inspection not found' });
      res.json(await action(req, orgId));
    } catch (err) {
      sendError(res, err);
    }
  };

// @route   GET /api/inspections/inspectors[?province=ON]
// @desc    Verified biomedical service providers that can be asked to inspect
// @access  Public
router.get('/inspectors', async (req: Request, res: Response) => {
  try {
    res.json(await listInspectors(req.query.province));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/inspections/product/:productId
// @desc    Published (completed) reports for a listing, newest first
// @access  Public
router.get('/product/:productId', async (req: Request, res: Response) => {
  try {
    res.json(await publishedReports(req.params.productId));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/inspections/:id/attachment
// @desc    Download the file attached to a completed report
// @access  Public (reports are public once completed)
router.get('/:id/attachment', async (req: Request, res: Response) => {
  try {
    const inspection = Types.ObjectId.isValid(req.params.id)
      ? await Inspection.findOne({ _id: req.params.id, status: 'completed' })
      : null;
    const file = inspection?.report?.attachment;
    if (!file) return res.status(404).json({ msg: 'Attachment not found' });

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(file.mimeType);
    res.download(path.join(keys.privateUploadDir, file.storedName), file.originalName, err => {
      if (err && !res.headersSent) res.status(404).json({ msg: 'Attachment file missing' });
    });
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/inspections   { productId, inspectorOrganizationId, note? }
// @desc    Ask an independent inspector to inspect one of your listings
// @access  Private (seller)
router.post('/', auth, async (req: Request, res: Response) => {
  try {
    const b = req.body;
    res.json(await requestInspection(req.user!.id, b.productId, b.inspectorOrganizationId, b.note));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/inspections/requested
// @desc    Inspections your organization requested for its listings
// @access  Private (seller)
router.get('/requested', auth, async (req: Request, res: Response) => {
  try {
    const orgId = await organizationOf(req.user!.id);
    if (!orgId) return res.json([]);
    res.json(await Inspection.find({ sellerOrganization: orgId })
      .populate('product', PRODUCT_FIELDS)
      .populate('inspectorOrganization', INSPECTOR_PUBLIC_FIELDS)
      .sort('-createdAt'));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/inspections/assigned
// @desc    Inspection requests sent to your organization, with the seller's contact
// @access  Private (inspector)
router.get('/assigned', auth, async (req: Request, res: Response) => {
  try {
    const orgId = await organizationOf(req.user!.id);
    if (!orgId) return res.json([]);
    res.json(await Inspection.find({ inspectorOrganization: orgId })
      .populate('product', PRODUCT_FIELDS)
      .populate('sellerOrganization', 'name province city phone')
      .populate('requestedBy', 'name email')
      .sort('-createdAt'));
  } catch (err) {
    sendError(res, err);
  }
});

// Seller
router.post('/:id/cancel', auth, withOrg((req, org) => cancelRequest(req.params.id, org)));

// Inspector
router.post('/:id/accept', auth, withOrg((req, org) => acceptRequest(req.params.id, org)));
router.post('/:id/decline', auth, withOrg((req, org) => declineRequest(req.params.id, org, req.body.note)));

// @route   POST /api/inspections/:id/report
// @desc    File the report (multipart: fields + optional "attachment" PDF/PNG/JPEG,
//          with "checks" as a JSON string). Published on the listing at once.
// @access  Private (the assigned inspector)
router.post('/:id/report', auth, receiveAttachment, async (req: Request, res: Response) => {
  const file = req.file;
  const discard = () => (file ? fs.unlink(file.path).catch(() => {}) : Promise.resolve());
  try {
    const orgId = await organizationOf(req.user!.id);
    if (!orgId) {
      await discard();
      return res.status(404).json({ msg: 'Inspection not found' });
    }

    let attachment;
    if (file) {
      const handle = await fs.open(file.path, 'r');
      const head = Buffer.alloc(8);
      await handle.read(head, 0, 8, 0);
      await handle.close();
      const mimeType = detectDocumentType(head);
      if (!mimeType) {
        await discard();
        return res.status(400).json({ msg: 'Only PDF, PNG and JPEG files are accepted' });
      }
      attachment = {
        originalName: path.basename(file.originalname).slice(0, 200),
        storedName: file.filename,
        mimeType,
        size: file.size
      };
    }

    res.json(await submitReport(req.params.id, orgId, req.user!.id, req.body, attachment));
  } catch (err) {
    await discard();
    sendError(res, err);
  }
});

export default router;
