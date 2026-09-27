import express, { Request, Response } from 'express';
import Order, { IOrder } from '../models/Order';
import auth from '../middleware/auth';
import stripe from '../services/stripe';
import { CheckoutError, finalizeOrder } from '../services/checkout';
import { FulfillmentError, confirmDelivery, openDispute } from '../services/fulfillment';

const router = express.Router();

// The buyer's view of an order: each seller's part with its shipping status,
// but not the seller's payout or the platform fee.
const forBuyer = (order: IOrder) => {
  const o = order.toJSON() as unknown as Record<string, unknown> & { fulfillments: Array<Record<string, unknown>> };
  o.fulfillments = o.fulfillments.map(({ payout: _p, platformFeeCents: _f, ...visible }) => visible);
  return o;
};

const sendError = (res: Response, err: unknown) => {
  if (err instanceof CheckoutError || err instanceof FulfillmentError) {
    return res.status(err.status).json({ msg: err.message });
  }
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

// Orders are created by POST /api/payment/create-payment-intent (priced
// server-side) and only become "paid" after Stripe confirms the payment, either
// here or via the webhook. Clients can no longer create orders directly.

// @route   POST /api/orders/:id/confirm
// @desc    Ask the server to verify the order's PaymentIntent with Stripe and finalize it
// @access  Private (order owner)
router.post('/:id/confirm', auth, async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.user.toString() !== req.user!.id) {
      return res.status(404).json({ msg: 'Order not found' });
    }
    if (!order.stripePaymentIntentId) {
      return res.status(400).json({ msg: 'Order has no payment' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    const finalized = await finalizeOrder(order.id, paymentIntent, id =>
      stripe.refunds.create({ payment_intent: id })
    );
    res.json(forBuyer(finalized));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/orders/:id/fulfillments/:fid/confirm-delivery
// @desc    Buyer confirms the equipment arrived; releases the seller's payment
// @access  Private (buyer)
router.post('/:id/fulfillments/:fid/confirm-delivery', auth, async (req: Request, res: Response) => {
  try {
    await confirmDelivery(req.params.id, req.params.fid, req.user!.id);
    const order = await Order.findById(req.params.id).populate('fulfillments.organization', 'name');
    res.json(forBuyer(order!));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/orders/:id/fulfillments/:fid/dispute   { reason }
// @desc    Buyer reports a problem; the seller's payment stays on hold until an admin resolves it
// @access  Private (buyer)
router.post('/:id/fulfillments/:fid/dispute', auth, async (req: Request, res: Response) => {
  try {
    await openDispute(req.params.id, req.params.fid, req.user!.id, req.body.reason);
    const order = await Order.findById(req.params.id).populate('fulfillments.organization', 'name');
    res.json(forBuyer(order!));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/orders
// @desc    List the logged-in user's orders (abandoned checkouts are hidden)
// @access  Private
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user!.id, status: { $ne: 'pending' } })
      .populate('fulfillments.organization', 'name')
      .sort('-createdAt');
    res.json(orders.map(forBuyer));
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
