import express, { Request, Response } from 'express';
import Organization from '../models/Organization';
import auth from '../middleware/auth';
import admin from '../middleware/admin';
import { VERIFICATION_STATUSES } from '../config/medical';
import { VerificationError, approve, reject } from '../services/verification';

const router = express.Router();

router.use(auth, admin);

const sendError = (res: Response, err: unknown) => {
  if (err instanceof VerificationError) return res.status(err.status).json({ msg: err.message });
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

// @route   GET /api/admin/organizations?status=pending
// @desc    Verification queue (defaults to organizations awaiting review, oldest first)
// @access  Admin
router.get('/organizations', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!(VERIFICATION_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ msg: `status must be one of: ${VERIFICATION_STATUSES.join(', ')}` });
    }
    const orgs = await Organization.find({ verificationStatus: status })
      .populate('owner', 'name email')
      .populate('verificationHistory.by', 'name')
      .sort('createdAt');
    res.json(orgs);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/admin/organizations/:id/verify
// @access  Admin
router.post('/organizations/:id/verify', async (req: Request, res: Response) => {
  try {
    res.json(await approve(req.params.id, req.user!.id));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/admin/organizations/:id/reject
// @desc    Reject a pending request or revoke a verification. Body: { note }
// @access  Admin
router.post('/organizations/:id/reject', async (req: Request, res: Response) => {
  try {
    res.json(await reject(req.params.id, req.user!.id, req.body.note));
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
