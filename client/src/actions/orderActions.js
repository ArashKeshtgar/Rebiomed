import axios from 'axios';
import { GET_ORDERS_SUCCESS, ADD_ORDER_SUCCESS, GET_ERRORS } from './types';

// The server prices the cart itself; we only send what we want and how many.
export const createPaymentIntent = async (cartItems) => {
  const items = cartItems.map(i => ({
    productId: i.productId,
    quantity: i.quantity,
    ...(i.offerId ? { offerId: i.offerId } : {})
  }));
  const res = await axios.post('/api/payment/create-payment-intent', { items });
  return res.data; // { clientSecret, orderId, subtotal, shipping, total }
};

// Asks the server to verify the payment with Stripe and finalize the order.
export const confirmOrder = (orderId) => async dispatch => {
  try {
    const res = await axios.post(`/api/orders/${orderId}/confirm`);
    dispatch({ type: ADD_ORDER_SUCCESS, payload: res.data });
    return res.data;
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
    throw err;
  }
};

export const getOrders = () => async dispatch => {
  try {
    const res = await axios.get('/api/orders');
    dispatch({ type: GET_ORDERS_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: GET_ERRORS, payload: err.response ? err.response.data : {} });
  }
};
