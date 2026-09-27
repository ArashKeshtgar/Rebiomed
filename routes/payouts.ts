import express, { Request, Response } from 'express';
import User from '../models/User';
import Organization from '../models/Organization';
import auth from '../middleware/auth';
import { stripeOps } from '../services/stripeOps';
import { startOnboarding, syncAccount } from '../services/fulfillment';

// Stripe Connect onboarding for sellers. Sellers are paid through a Stripe
// Express account; ReBiomed never stores their bank details.
const router = express.Router();

router.use(auth);

const payoutState = (org: { stripeAccountId?: string; stripeDetailsSubmitted: boolean; payoutsEnabled: boolean }) => ({
  connected: !!org.stripeAccountId,
  detailsSubmitted: org.stripeDetailsSubmitted,
  payoutsEnabled: org.payoutsEnabled
});

// Failures here are almost always Stripe (bad key, network), so report 502.
const stripeFailure = (res: Response, err: unknown) => {
  console.error((err as Error).message);
  res.status(502).json({ msg: 'Stripe is unavailable right now. Check STRIPE_SECRET_KEY and try again.' });
};

const loadMine = async (userId: string) => {
  const user = await User.findById(userId);
  const org = user?.organization ? await Organization.findById(user.organization) : null;
  return { user, org };
};

// @route   GET /api/payouts/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { org } = await loadMine(req.user!.id);
    if (!org) return res.status(404).json({ msg: 'Create your organization first' });
    res.json(payoutState(org));
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/payouts/onboarding
// @desc    Create the Stripe Express account if needed and return a one-time onboarding URL
router.post('/onboarding', async (req: Request, res: Response) => {
  try {
    const { user, org } = await loadMine(req.user!.id);
    if (!org || !user) return res.status(404).json({ msg: 'Create your organization first' });
    res.json({ url: await startOnboarding(org, user.email) });
  } catch (err) {
    stripeFailure(res, err);
  }
});

// @route   POST /api/payouts/refresh
// @desc    Re-read the account from Stripe (after returning from onboarding) and
//          release payouts that were waiting for it
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { org } = await loadMine(req.user!.id);
    if (!org) return res.status(404).json({ msg: 'Create your organization first' });
    if (!org.stripeAccountId) return res.json(payoutState(org));
    const synced = await syncAccount(org, await stripeOps.retrieveAccount(org.stripeAccountId));
    res.json(payoutState(synced));
  } catch (err) {
    stripeFailure(res, err);
  }
});

// @route   POST /api/payouts/dashboard-link
// @desc    One-time link to the seller's Stripe Express dashboard (payout history, bank details)
router.post('/dashboard-link', async (req: Request, res: Response) => {
  try {
    const { org } = await loadMine(req.user!.id);
    if (!org?.stripeAccountId || !org.stripeDetailsSubmitted) {
      return res.status(409).json({ msg: 'Finish setting up payouts first' });
    }
    res.json({ url: await stripeOps.createDashboardLink(org.stripeAccountId) });
  } catch (err) {
    stripeFailure(res, err);
  }
});

export default router;
