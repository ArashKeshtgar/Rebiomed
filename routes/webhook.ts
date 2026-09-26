import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import keys from '../config/keys';
import stripe from '../services/stripe';
import { finalizeOrder, markOrderFailed } from '../services/checkout';

const router = express.Router();

const refund = (paymentIntentId: string) => stripe.refunds.create({ payment_intent: paymentIntentId });

// @route   POST /api/payment/webhook
// @desc    Stripe webhook. Needs the raw body for signature verification, so it is
//          mounted in app.ts before express.json().
// @access  Stripe (signature-verified)
router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  if (!keys.stripeWebhookSecret) {
    return res.status(503).json({ msg: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.header('stripe-signature') ?? '',
      keys.stripeWebhookSecret
    );
  } catch (err) {
    return res.status(400).json({ msg: `Webhook signature verification failed: ${(err as Error).message}` });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      if (pi.metadata.orderId) await finalizeOrder(pi.metadata.orderId, pi, refund);
    } else if (event.type === 'payment_intent.payment_failed') {
      await markOrderFailed(event.data.object.id);
    }
    res.json({ received: true });
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).json({ msg: 'Webhook handling failed' });
  }
});

export default router;
