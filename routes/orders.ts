import express, { Request, Response } from 'express';
import Order from '../models/Order';
import auth from '../middleware/auth';
import stripe from '../services/stripe';
import { CheckoutError, finalizeOrder } from '../services/checkout';

const router = express.Router();

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
    res.json(finalized);
  } catch (err) {
    if (err instanceof CheckoutError) {
      return res.status(err.status).json({ msg: err.message });
    }
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/orders
// @desc    List the logged-in user's orders (abandoned checkouts are hidden)
// @access  Private
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user!.id, status: { $ne: 'pending' } }).sort('-createdAt');
    res.json(orders);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

export default router;
