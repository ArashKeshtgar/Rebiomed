import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { removeFromCart, updateCartQty } from '../../actions/cartActions';
import { formatPrice } from '../../utils/medical';

const CartPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(state => state.cart.items);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total = subtotal;

  if (!items.length) {
    return (
      <div className="container py-5 text-center">
        <div style={{ fontSize: '4rem' }}>🛒</div>
        <h1 className="mt-3">Your cart is empty</h1>
        <p className="text-muted mb-4">Looks like you haven't added anything yet.</p>
        <Link to="/products" className="btn btn-primary btn-lg">Browse Equipment</Link>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h1 className="mb-4">Your Cart</h1>
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <AnimatePresence>
              {items.map(item => (
                <motion.div
                  key={item.productId}
                  className="d-flex align-items-center border-bottom p-3"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -50 }}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    width="80"
                    height="80"
                    style={{ objectFit: 'cover' }}
                    className="rounded me-3"
                  />
                  <div className="flex-grow-1">
                    <h6 className="mb-1">{item.title}</h6>
                    {item.offerId ? (
                      <span>
                        <span className="badge bg-success me-2">Your offer</span>
                        {formatPrice(item.price)}{' '}
                        {item.listPrice && <s className="text-muted small">{formatPrice(item.listPrice)}</s>}
                      </span>
                    ) : (
                      <span className="text-muted">{formatPrice(item.price)} each</span>
                    )}
                  </div>
                  <div className="d-flex align-items-center border rounded mx-3">
                    <button
                      className="btn btn-sm"
                      onClick={() => dispatch(updateCartQty(item.productId, item.quantity - 1))}
                      disabled={!!item.offerId}
                    >
                      −
                    </button>
                    <span className="px-3">{item.quantity}</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => dispatch(updateCartQty(item.productId, item.quantity + 1))}
                      disabled={!!item.offerId || (item.stock !== undefined && item.quantity >= item.stock)}
                    >
                      +
                    </button>
                  </div>
                  <strong className="me-3" style={{ minWidth: 110, textAlign: 'right' }}>
                    {formatPrice(item.price * item.quantity)}
                  </strong>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => dispatch(removeFromCart(item.productId))}
                  >
                    Remove
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Link to="/products" className="d-inline-block mt-3">&larr; Continue Shopping</Link>
        </div>

        <div className="col-lg-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title mb-3">Order Summary</h5>
              <div className="d-flex justify-content-between mb-2">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="d-flex justify-content-between mb-2 text-muted">
                <span>Freight</span>
                <span>Arranged with seller</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between mb-3">
                <strong>Total</strong>
                <strong>{formatPrice(total)}</strong>
              </div>
              <motion.button
                className="btn btn-success btn-lg w-100"
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/checkout')}
              >
                Proceed to Checkout
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
