import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { logoutUser } from '../../actions/authActions';

const Navbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSelector(state => state.auth);
  const cartCount = useSelector(state =>
    state.cart.items.reduce((sum, i) => sum + i.quantity, 0)
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = () => {
    setMenuOpen(false);
    dispatch(logoutUser());
    navigate('/login');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3">
      <div className="d-flex align-items-center justify-content-between w-100 flex-wrap">
        <Link className="navbar-brand fw-bold" to="/" onClick={closeMenu}>
          <span style={{ color: 'var(--voltra-accent)' }}>Volt</span>ra
        </Link>
        <button
          className="btn btn-outline-light d-lg-none"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          &#9776;
        </button>

        <div className={`navbar-collapse w-100 d-lg-flex ${menuOpen ? 'd-flex flex-column' : 'd-none'}`}>
              <ul className="navbar-nav me-auto mt-2 mt-lg-0">
                <li className="nav-item">
                  <Link className="nav-link" to="/products" onClick={closeMenu}>Equipment</Link>
                </li>
                {isAuthenticated && (
                  <>
                    <li className="nav-item">
                      <Link className="nav-link" to="/orders" onClick={closeMenu}>My Orders</Link>
                    </li>
                    <li className="nav-item">
                      <Link className="nav-link" to="/sell" onClick={closeMenu}>Sell Equipment</Link>
                    </li>
                    <li className="nav-item">
                      <Link className="nav-link" to="/my-listings" onClick={closeMenu}>My Listings</Link>
                    </li>
                    <li className="nav-item">
                      <Link className="nav-link" to="/organization" onClick={closeMenu}>My Organization</Link>
                    </li>
                  </>
                )}
              </ul>
              <ul className="navbar-nav align-items-lg-center mt-2 mt-lg-0">
                <li className="nav-item">
                  <Link className="nav-link position-relative" to="/cart" onClick={closeMenu}>
                    Cart
                    <AnimatePresence>
                      {cartCount > 0 && (
                        <motion.span
                          key={cartCount}
                          className="badge bg-danger rounded-pill position-absolute top-0 start-100 translate-middle"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                        >
                          {cartCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </li>
                {isAuthenticated ? (
                  <li className="nav-item d-flex align-items-center mt-2 mt-lg-0">
                    <span className="text-light me-2">Hi, {user.name}</span>
                    <button className="btn btn-sm btn-outline-light" onClick={onLogout}>
                      Logout
                    </button>
                  </li>
                ) : (
                  <>
                    <li className="nav-item">
                      <Link className="nav-link" to="/login" onClick={closeMenu}>Login</Link>
                    </li>
                    <li className="nav-item">
                      <Link className="nav-link" to="/register" onClick={closeMenu}>Register</Link>
                    </li>
                  </>
                )}
              </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
