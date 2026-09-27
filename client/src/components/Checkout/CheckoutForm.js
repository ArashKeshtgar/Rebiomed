import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { motion } from 'framer-motion';
import { createPaymentIntent, confirmOrder } from '../../actions/orderActions';
import { clearCart } from '../../actions/cartActions';
import { formatPrice } from '../../utils/medical';

const stripePromise = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY)
  : null;

const SuccessScreen = () => (
  <motion.div
    className="text-center py-5"
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
  >
    <motion.div
      style={{ fontSize: '4rem' }}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 12 }}
    >
      ✅
    </motion.div>
    <h2 className="mt-3">Payment Successful!</h2>
    <p className="text-muted">Redirecting you to your orders...</p>
  </motion.div>
);

const PayForm = ({ orderId, total, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const dispatch = useDispatch();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const onSubmit = async e => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError('');

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required'
    });

    if (confirmError) {
      setError(confirmError.message);
      setProcessing(false);
      return;
    }

    try {
      const order = await dispatch(confirmOrder(orderId));
      if (order.status === 'refunded') {
        setError('Sorry, an item sold out while you were paying. Your payment has been refunded.');
        return;
      }
      dispatch(clearCart());
      onSuccess();
    } catch (err) {
      setError('Payment succeeded but confirming the order failed. Please contact support.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <PaymentElement />
      {error && <p className="text-danger mt-3">{error}</p>}
      <motion.button
        type="submit"
        className="btn btn-success btn-lg mt-4 w-100"
        whileTap={{ scale: 0.97 }}
        disabled={!stripe || processing}
      >
        {processing ? 'Processing...' : `Pay ${formatPrice(total)}`}
      </motion.button>
      <p className="text-muted small mt-2">
        Your payment is held by ReBiomed and released to the seller only after you confirm the equipment arrived.
      </p>
      <p className="text-muted small">
        Test card: 4242 4242 4242 4242, any future date, any CVC.
      </p>
    </form>
  );
};

const CheckoutForm = () => {
  const navigate = useNavigate();
  const items = useSelector(state => state.cart.items);
  // Totals come from the server, which prices the cart from the database.
  const [checkout, setCheckout] = useState(null);
  const [intentError, setIntentError] = useState('');
  const [succeeded, setSucceeded] = useState(false);

  useEffect(() => {
    if (!items.length) return;
    setCheckout(null);
    setIntentError('');
    createPaymentIntent(items)
      .then(setCheckout)
      .catch(err => setIntentError(
        (err.response && err.response.data && err.response.data.msg) ||
        'Could not start checkout. Make sure STRIPE_SECRET_KEY is set to a valid test key in the backend .env file.'
      ));
  }, [items]);

  const onSuccess = () => {
    setSucceeded(true);
    setTimeout(() => navigate('/orders'), 2200);
  };

  if (succeeded) {
    return <div className="container py-4" style={{ maxWidth: 480 }}><SuccessScreen /></div>;
  }

  if (!items.length) {
    return <div className="container py-4"><p>Your cart is empty.</p></div>;
  }

  if (!stripePromise) {
    return (
      <div className="container py-4">
        <p className="text-danger">
          Stripe is not configured. Set REACT_APP_STRIPE_PUBLISHABLE_KEY in client/.env.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-4" style={{ maxWidth: 480 }}>
      <h1 className="mb-4">Checkout</h1>
      {checkout && (
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between">
              <span>Subtotal</span>
              <span>{formatPrice(checkout.subtotal)}</span>
            </div>
            <div className="d-flex justify-content-between text-muted">
              <span>Freight</span>
              <span>{checkout.shipping ? formatPrice(checkout.shipping) : 'Arranged with seller'}</span>
            </div>
            <hr />
            <div className="d-flex justify-content-between">
              <strong>Total</strong>
              <strong>{formatPrice(checkout.total)}</strong>
            </div>
          </div>
        </div>
      )}
      {intentError && <p className="text-danger">{intentError}</p>}
      {checkout && (
        <Elements key={checkout.clientSecret} stripe={stripePromise} options={{ clientSecret: checkout.clientSecret }}>
          <PayForm orderId={checkout.orderId} total={checkout.total} onSuccess={onSuccess} />
        </Elements>
      )}
    </div>
  );
};

export default CheckoutForm;
