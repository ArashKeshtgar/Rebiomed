import { ADD_TO_CART, ADD_OFFER_TO_CART, REMOVE_FROM_CART, UPDATE_CART_QTY, CLEAR_CART } from './types';

export const addToCart = (product, quantity = 1) => ({
  type: ADD_TO_CART,
  payload: { product, quantity }
});

// Puts one unit in the cart at an accepted offer's price (replacing any other
// line for the same listing). The server re-checks the offer at checkout.
export const addOfferToCart = (offer) => ({
  type: ADD_OFFER_TO_CART,
  payload: offer
});

export const removeFromCart = (productId) => ({
  type: REMOVE_FROM_CART,
  payload: productId
});

export const updateCartQty = (productId, quantity) => ({
  type: UPDATE_CART_QTY,
  payload: { productId, quantity }
});

export const clearCart = () => ({ type: CLEAR_CART });
