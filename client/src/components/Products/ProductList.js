import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { getProducts } from '../../actions/productActions';
import { addToCart } from '../../actions/cartActions';
import { CONDITIONS, DEVICE_CLASSES, PROVINCES, VERIFICATION_BADGES, formatPrice } from '../../utils/medical';

const FILTER_KEYS = ['category', 'deviceClass', 'condition', 'province'];

const ProductList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map(k => [k, searchParams.get(k) || '']));
  const filterKey = FILTER_KEYS.map(k => filters[k]).join('|');
  const { products, loading } = useSelector(state => state.products);
  const [categories, setCategories] = useState([]);
  const [justAdded, setJustAdded] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get('/api/categories').then(res => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const [category, deviceClass, condition, province] = filterKey.split('|');
    dispatch(getProducts({ category, deviceClass, condition, province }));
  }, [dispatch, filterKey]);

  const onAddToCart = (product) => {
    dispatch(addToCart(product));
    setJustAdded(product._id);
    setTimeout(() => setJustAdded(null), 1200);
  };

  const setFilter = (key, value) => {
    const next = { ...filters, [key]: value };
    setSearchParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };

  const term = search.trim().toLowerCase();
  const visibleProducts = products.filter(p =>
    [p.title, p.manufacturer, p.deviceModel].some(f => (f || '').toLowerCase().includes(term))
  );

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="mb-0">Equipment</h1>
        <input
          type="search"
          className="form-control"
          style={{ maxWidth: 280 }}
          placeholder="Search title, manufacturer, model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="d-flex gap-2 flex-wrap mb-3">
        <button
          className={`btn btn-sm ${!filters.category ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setFilter('category', '')}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat._id}
            className={`btn btn-sm ${filters.category === cat._id ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setFilter('category', cat._id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="row g-2 mb-4" style={{ maxWidth: 720 }}>
        <div className="col-sm-4">
          <select className="form-select form-select-sm" aria-label="Device class"
            value={filters.deviceClass} onChange={e => setFilter('deviceClass', e.target.value)}>
            <option value="">Any device class</option>
            {Object.entries(DEVICE_CLASSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="col-sm-4">
          <select className="form-select form-select-sm" aria-label="Condition"
            value={filters.condition} onChange={e => setFilter('condition', e.target.value)}>
            <option value="">Any condition</option>
            {Object.entries(CONDITIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="col-sm-4">
          <select className="form-select form-select-sm" aria-label="Province"
            value={filters.province} onChange={e => setFilter('province', e.target.value)}>
            <option value="">All provinces</option>
            {Object.entries(PROVINCES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : !visibleProducts.length ? (
        <p className="text-muted">No equipment matches your filters.</p>
      ) : (
        <div className="row g-4">
          {visibleProducts.map((product, i) => {
            const soldOut = product.stock < 1;
            const badge = VERIFICATION_BADGES[product.organization?.verificationStatus];
            return (
              <motion.div
                key={product._id}
                className="col-md-4 col-lg-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ y: -6 }}
              >
                <div
                  className="card h-100 shadow-sm"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/products/${product._id}`)}
                >
                  <img
                    src={product.imageUrl}
                    className="card-img-top"
                    alt={product.title}
                    style={{ height: 200, objectFit: 'cover' }}
                  />
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex gap-1 flex-wrap mb-2">
                      <span className="badge bg-info text-dark">Class {product.deviceClass}</span>
                      <span className="badge bg-light text-dark border">{CONDITIONS[product.condition]}</span>
                    </div>
                    <h5 className="card-title mb-1">{product.title}</h5>
                    <p className="text-muted small mb-1">{product.manufacturer} {product.deviceModel}</p>
                    <p className="text-muted small flex-grow-1 mb-2">
                      📍 {product.location?.city}, {product.location?.province}
                      {badge && <span className={`badge ${badge.className} ms-2`}>{badge.label}</span>}
                    </p>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <strong>{formatPrice(product.price)}</strong>
                      <Link
                        to={`/products/${product._id}`}
                        className="btn btn-sm btn-outline-secondary"
                        onClick={e => e.stopPropagation()}
                      >
                        Details
                      </Link>
                    </div>
                    <motion.button
                      className={`btn btn-sm w-100 ${justAdded === product._id ? 'btn-success' : 'btn-primary'}`}
                      whileTap={{ scale: 0.95 }}
                      disabled={soldOut}
                      onClick={e => { e.stopPropagation(); onAddToCart(product); }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={justAdded === product._id ? 'added' : 'add'}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 6 }}
                          transition={{ duration: 0.15 }}
                        >
                          {soldOut ? 'Sold' : justAdded === product._id ? 'Added ✓' : 'Add to Cart'}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductList;
