import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import keys from '../config/keys';
import stripe from '../services/stripe';
import { finalizeOrder, markOrderFailed } from '../services/checkout';
import { syncAccount } from '../services/fulfillment';
import { toAccountState } from '../services/stripeOps';
import Organization from '../models/Organization';

const router = express.Router();

const refund = (paymentIntentId: string) => stripe.refunds.create({ payment_intent: paymentIntentId });

// Stripe sends platform events (payments) and Connect events (sellers'
// accounts) from two separately configured endpoints, each with its own
// signing secret. Both may point here; an event is accepted if it verifies
// against either one.
const verify = (body: Buffer, signature: string): Stripe.Event => {
  const secrets = [keys.stripeWebhookSecret, keys.stripeConnectWebhookSecret].filter(Boolean);
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

// @route   POST /api/payment/webhook
// @desc    Stripe webhook. Needs the raw body for signature verification, so it is
//          mounted in app.ts before express.json().
// @access  Stripe (signature-verified)
router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  if (!keys.stripeWebhookSecret && !keys.stripeConnectWebhookSecret) {
    return res.status(503).json({ msg: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;
  try {
    event = verify(req.body, req.header('stripe-signature') ?? '');
  } catch (err) {
    return res.status(400).json({ msg: `Webhook signature verification failed: ${(err as Error).message}` });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      if (pi.metadata.orderId) await finalizeOrder(pi.metadata.orderId, pi, refund);
    } else if (event.type === 'payment_intent.payment_failed') {
      await markOrderFailed(event.data.object.id);
    } else if (event.type === 'account.updated') {
      // A seller progressed through (or lost) Stripe onboarding.
      const org = await Organization.findOne({ stripeAccountId: event.data.object.id });
      if (org) await syncAccount(org, toAccountState(event.data.object));
    }
    res.json({ received: true });
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).json({ msg: 'Webhook handling failed' });
  }
});

export default router;
