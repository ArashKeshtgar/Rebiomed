import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { getProduct } from '../../actions/productActions';
import { addToCart } from '../../actions/cartActions';
import ReviewList from '../Reviews/ReviewList';
import AddReview from '../Reviews/AddReview';
import {
  CONDITIONS,
  DEVICE_CLASSES,
  ORGANIZATION_TYPES,
  PROVINCES,
  SERVICE_TYPES,
  VERIFICATION_BADGES,
  formatDate,
  formatPrice
} from '../../utils/medical';

const SpecRow = ({ label, children }) => (
  <tr>
    <th scope="row" className="text-muted fw-normal" style={{ width: '45%' }}>{label}</th>
    <td>{children}</td>
  </tr>
);

const ProductDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { product, loading } = useSelector(state => state.products);
  const isAuthenticated = useSelector(state => state.auth.isAuthenticated);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    dispatch(getProduct(id));
  }, [dispatch, id]);

  const onAddToCart = () => {
    dispatch(addToCart(product, quantity));
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  if (loading || !product) return <div className="container py-4">Loading...</div>;

  const org = product.organization;
  const badge = org && VERIFICATION_BADGES[org.verificationStatus];
  const soldOut = product.stock < 1;
  const history = [...(product.serviceHistory || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="container py-4">
      <div className="row g-4">
        <motion.div
          className="col-md-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <img src={product.imageUrl} alt={product.title} className="img-fluid rounded shadow-sm" />
        </motion.div>
        <motion.div
          className="col-md-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="d-flex gap-1 flex-wrap mb-2">
            <span className="badge bg-secondary">{product.category?.name}</span>
            <span className="badge bg-info text-dark">Health Canada Class {product.deviceClass}</span>
            <span className="badge bg-light text-dark border">{CONDITIONS[product.condition]}</span>
          </div>
          <h1>{product.title}</h1>
          <p className="text-muted mb-0">{product.manufacturer} {product.deviceModel}</p>
          <h3 className="my-3" style={{ color: 'var(--rebiomed-accent-dark)' }}>
            {formatPrice(product.price)}
          </h3>
          <p>{product.description}</p>
          {soldOut ? (
            <p className="fw-bold text-danger">Sold</p>
          ) : (
            <div className="d-flex align-items-center gap-2 mb-3">
              {product.stock > 1 && (
                <input
                  type="number"
                  min="1"
                  max={product.stock}
                  className="form-control"
                  style={{ width: 80 }}
                  value={quantity}
                  onChange={e => setQuantity(Math.min(product.stock, Math.max(1, Number(e.target.value))))}
                />
              )}
              <motion.button
                className={`btn ${added ? 'btn-success' : 'btn-primary'}`}
                whileTap={{ scale: 0.95 }}
                onClick={onAddToCart}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={added ? 'added' : 'add'}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {added ? 'Added to Cart ✓' : 'Add to Cart'}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
          )}

          {org && (
            <div className="card border-0 bg-light mt-4">
              <div className="card-body">
                <div className="text-muted small mb-1">Sold by</div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong>{org.name}</strong>
                  {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
                </div>
                <div className="text-muted small">
                  {ORGANIZATION_TYPES[org.type]} · {org.city}, {PROVINCES[org.province]}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="row g-4 mt-2">
        <div className="col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h3 className="h5 mb-3">Specifications</h3>
              <table className="table table-sm mb-0">
                <tbody>
                  <SpecRow label="Manufacturer">{product.manufacturer}</SpecRow>
                  <SpecRow label="Model">{product.deviceModel}</SpecRow>
                  <SpecRow label="Year of manufacture">{product.yearOfManufacture || '—'}</SpecRow>
                  <SpecRow label="Health Canada device class">{DEVICE_CLASSES[product.deviceClass]}</SpecRow>
                  <SpecRow label="Medical Device Licence (MDL)">{product.mdlNumber || '—'}</SpecRow>
                  <SpecRow label="Condition">{CONDITIONS[product.condition]}</SpecRow>
                  <SpecRow label="Usage hours">
                    {product.usageHours != null ? product.usageHours.toLocaleString('en-CA') : '—'}
                  </SpecRow>
                  <SpecRow label="Last service">{formatDate(product.lastServiceDate)}</SpecRow>
                  <SpecRow label="Last calibration">{formatDate(product.lastCalibrationDate)}</SpecRow>
                  <SpecRow label="Location">
                    {product.location?.city}, {PROVINCES[product.location?.province]}
                  </SpecRow>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <h3 className="h5 mb-3">Service history</h3>
              {!history.length ? (
                <p className="text-muted mb-0">The seller has not provided a service history.</p>
              ) : (
                <table className="table table-sm mb-0">
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Performed by</th></tr>
                  </thead>
                  <tbody>
                    {history.map((r, i) => (
                      <tr key={i}>
                        <td className="text-nowrap">{formatDate(r.date)}</td>
                        <td>{SERVICE_TYPES[r.type]}</td>
                        <td>{r.performedBy}{r.notes && <div className="text-muted small">{r.notes}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-muted small mt-3 mb-0">
                Service records are provided by the seller and have not been independently verified.
              </p>
            </div>
          </div>
        </div>
      </div>

      <hr className="my-5" />
      <div className="card shadow-sm">
        <div className="card-body">
          <h3 className="mb-3">Reviews</h3>
          {isAuthenticated && <AddReview productId={product._id} />}
          <ReviewList productId={product._id} />
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
