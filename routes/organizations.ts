import express, { Request, Response } from 'express';
import { Types } from 'mongoose';
import { check, validationResult } from 'express-validator';
import Organization from '../models/Organization';
import User from '../models/User';
import auth from '../middleware/auth';
import { ORGANIZATION_TYPES, PROVINCES } from '../config/medical';

const router = express.Router();

// Fields an owner may set. verificationStatus is deliberately absent: only the
// (future) admin review flow may change it.
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
const PUBLIC_FIELDS = 'name type province city website verificationStatus createdAt';

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
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/organizations/mine
// @access  Private
router.get('/mine', auth, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    const org = user?.organization ? await Organization.findById(user.organization) : null;
    if (!org) return res.status(404).json({ msg: 'No organization yet' });
    res.json(org);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   PUT /api/organizations/mine
// @access  Private
router.put('/mine', auth, orgValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const org = await Organization.findOne({ owner: req.user!.id });
    if (!org) return res.status(404).json({ msg: 'No organization yet' });
    org.set(pickEditable(req.body));
    await org.save();
    res.json(org);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
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
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

export default router;
