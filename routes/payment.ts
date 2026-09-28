import express, { Request, Response } from 'express';
import auth from '../middleware/auth';
import stripe, { requirePayments } from '../services/stripe';
import { CheckoutError, CURRENCY, createPendingOrder, priceCart } from '../services/checkout';

const router = express.Router();

// @route   POST /api/payment/create-payment-intent
// @desc    Price the cart server-side, create a pending order and a matching PaymentIntent
// @body    { items: [{ productId, quantity, offerId? }] }
// @access  Private
router.post('/create-payment-intent', auth, requirePayments, async (req: Request, res: Response) => {
  try {
    const cart = await priceCart(req.body.items, req.user!.id);
    const order = await createPendingOrder(req.user!.id, cart);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: cart.totalCents,
      currency: CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: order.id },
      // Groups the seller transfers made later for this order.
      transfer_group: `order_${order.id}`
    });

    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total
    });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return res.status(err.status).json({ msg: err.message });
    }
    console.error((err as Error).message);
    res.status(500).json({ msg: 'Payment intent creation failed' });
  }
});

export default router;
