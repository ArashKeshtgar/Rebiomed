import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Types } from 'mongoose';
import { check, validationResult } from 'express-validator';
import Organization from '../models/Organization';
import User from '../models/User';
import auth from '../middleware/auth';
import { isAdminUser } from '../middleware/admin';
import keys from '../config/keys';
import {
  DOCUMENT_KINDS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  ORGANIZATION_TYPES,
  PROVINCES
} from '../config/medical';
import {
  IDENTITY_FIELDS,
  VerificationError,
  changeVerificationStatus,
  detectDocumentType,
  requestVerification
} from '../services/verification';

const router = express.Router();

// Fields an owner may set. Verification fields are deliberately absent: they
// only change through the verification flow.
const EDITABLE_FIELDS = ['name', 'type', 'province', 'city', 'phone', 'website', 'mdelNumber'] as const;

const pickEditable = (body: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const f of EDITABLE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
};

const orgValidators = [
  check('name', 'Organization name is required').trim().notEmpty(),
  check('type', `Type must be one of: ${ORGANIZATION_TYPES.join(', ')}`).isIn(ORGANIZATION_TYPES),
  check('province', 'Province must be a Canadian province/territory code').isIn(PROVINCES),
  check('city', 'City is required').trim().notEmpty(),
  check('website', 'Website must be a valid URL').optional({ values: 'falsy' }).isURL()
];

// Public fields shown next to listings.
const PUBLIC_FIELDS = 'name type province city website verificationStatus verifiedAt createdAt';

const findMyOrg = async (userId: string) => {
  const user = await User.findById(userId);
  return user?.organization ? Organization.findById(user.organization) : null;
};

const sendError = (res: Response, err: unknown) => {
  if (err instanceof VerificationError) return res.status(err.status).json({ msg: err.message });
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

const documentUpload = multer({
  dest: keys.privateUploadDir,
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 }
}).single('document');

// Runs multer and turns its errors (e.g. file too large) into 400 responses.
const receiveDocument = (req: Request, res: Response, next: NextFunction) => {
  documentUpload(req, res, err => {
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

// @route   POST /api/organizations
// @desc    Create the logged-in user's organization (one per user)
// @access  Private
router.post('/', auth, orgValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = await User.findById(req.user!.id);
    if (!user) return res.status(401).json({ msg: 'User not found' });
    if (user.organization) {
      return res.status(400).json({ errors: [{ msg: 'You already have an organization' }] });
    }

    const org = await Organization.create({ ...pickEditable(req.body), owner: user._id });
    user.organization = org._id as Types.ObjectId;
    await user.save();

    res.json(org);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/organizations/mine
// @access  Private
router.get('/mine', auth, async (req: Request, res: Response) => {
  try {
    const org = await findMyOrg(req.user!.id);
    if (!org) return res.status(404).json({ msg: 'No organization yet' });
    res.json(org);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   PUT /api/organizations/mine
// @desc    Edit the organization. Changing identity details resets verification.
// @access  Private
router.put('/mine', auth, orgValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const org = await Organization.findOne({ owner: req.user!.id });
    if (!org) return res.status(404).json({ msg: 'No organization yet' });

    const norm = (v: unknown) => String(v ?? '').trim();
    const before = Object.fromEntries(IDENTITY_FIELDS.map(f => [f, norm(org.get(f))]));
    org.set(pickEditable(req.body));
    await org.save();

    const identityChanged = IDENTITY_FIELDS.some(f => norm(org.get(f)) !== before[f]);
    if (identityChanged && (org.verificationStatus === 'verified' || org.verificationStatus === 'pending')) {
      await changeVerificationStatus(org, 'unverified', req.user!.id,
        'Organization details changed after review; request verification again');
    }
    res.json(org);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/organizations/mine/documents
// @desc    Upload a supporting document (PDF, PNG or JPEG, field "document", plus "kind")
// @access  Private
router.post('/mine/documents', auth, receiveDocument, async (req: Request, res: Response) => {
  const file = req.file;
  const discard = () => (file ? fs.unlink(file.path).catch(() => {}) : Promise.resolve());
  try {
    if (!file) return res.status(400).json({ msg: 'Attach a file in the "document" field' });

    const kind = req.body.kind;
    if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      await discard();
      return res.status(400).json({ msg: `Document kind must be one of: ${DOCUMENT_KINDS.join(', ')}` });
    }

    const org = await findMyOrg(req.user!.id);
    if (!org) {
      await discard();
      return res.status(404).json({ msg: 'No organization yet' });
    }
    if (org.documents.length >= MAX_DOCUMENTS) {
      await discard();
      return res.status(400).json({ msg: `At most ${MAX_DOCUMENTS} documents` });
    }

    const handle = await fs.open(file.path, 'r');
    const head = Buffer.alloc(8);
    await handle.read(head, 0, 8, 0);
    await handle.close();
    const mimeType = detectDocumentType(head);
    if (!mimeType) {
      await discard();
      return res.status(400).json({ msg: 'Only PDF, PNG and JPEG files are accepted' });
    }

    org.documents.push({
      kind,
      originalName: path.basename(file.originalname).slice(0, 200),
      storedName: file.filename,
      mimeType,
      size: file.size,
      uploadedAt: new Date()
    });
    await org.save();
    res.json(org);
  } catch (err) {
    await discard();
    sendError(res, err);
  }
});

// @route   DELETE /api/organizations/mine/documents/:docId
// @access  Private (not while a review is in progress)
router.delete('/mine/documents/:docId', auth, async (req: Request, res: Response) => {
  try {
    const org = await findMyOrg(req.user!.id);
    if (!org) return res.status(404).json({ msg: 'No organization yet' });
    if (org.verificationStatus === 'pending') {
      return res.status(409).json({ msg: 'Documents cannot be removed while verification is under review' });
    }
    const doc = org.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ msg: 'Document not found' });

    const storedName = doc.storedName;
    doc.deleteOne();
    await org.save();
    await fs.unlink(path.join(keys.privateUploadDir, storedName)).catch(() => {});
    res.json(org);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/organizations/mine/verification-request
// @desc    Submit the organization for admin review
// @access  Private
router.post('/mine/verification-request', auth, async (req: Request, res: Response) => {
  try {
    const org = await findMyOrg(req.user!.id);
    if (!org) return res.status(404).json({ msg: 'No organization yet' });
    res.json(await requestVerification(org, req.user!.id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/organizations/:id/documents/:docId
// @desc    Download a verification document
// @access  Private (organization owner or admin)
router.get('/:id/documents/:docId', auth, async (req: Request, res: Response) => {
  try {
    const org = Types.ObjectId.isValid(req.params.id) ? await Organization.findById(req.params.id) : null;
    const allowed = org && (org.owner.toString() === req.user!.id || await isAdminUser(req.user!.id));
    // 404 rather than 403 so outsiders cannot probe which organizations exist.
    const doc = allowed ? org.documents.id(req.params.docId) : null;
    if (!doc) return res.status(404).json({ msg: 'Document not found' });

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(doc.mimeType);
    res.download(path.join(keys.privateUploadDir, doc.storedName), doc.originalName, err => {
      if (err && !res.headersSent) res.status(404).json({ msg: 'Document file missing' });
    });
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/organizations/:id
// @desc    Public seller profile
// @access  Public
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ msg: 'Organization not found' });
    const org = await Organization.findById(req.params.id).select(PUBLIC_FIELDS);
    if (!org) return res.status(404).json({ msg: 'Organization not found' });
    res.json(org);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
