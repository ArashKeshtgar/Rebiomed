import { NextFunction, Request, Response } from 'express';
import Stripe from 'stripe';
import keys from '../config/keys';

export const paymentsConfigured = !!keys.stripeSecretKey;

// The SDK throws on construction without a key, which would take the whole
// server down (e.g. a demo deployment before Stripe is set up). Use a
// placeholder instead, and let payment endpoints say payments are off.
const stripe = new Stripe(keys.stripeSecretKey || 'sk_test_not_configured');

export function requirePayments(_req: Request, res: Response, next: NextFunction): void {
  if (paymentsConfigured) return next();
  res.status(503).json({ msg: 'Payments are not configured on this server yet' });
}

export default stripe;
