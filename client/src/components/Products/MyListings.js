import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { getMyProducts, deleteProduct } from '../../actions/productActions';
import { formatPrice } from '../../utils/medical';

const MyListings = () => {
  const dispatch = useDispatch();
  const { myProducts, loading } = useSelector(state => state.products);

  useEffect(() => {
    dispatch(getMyProducts());
  }, [dispatch]);

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="mb-0">My Listings</h1>
        <Link to="/sell" className="btn btn-primary">+ New Listing</Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : !myProducts.length ? (
        <p className="text-muted">You haven't listed any equipment yet.</p>
      ) : (
        <div className="row g-4">
          {myProducts.map((product, i) => (
            <motion.div
              key={product._id}
              className="col-md-4 col-lg-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div className="card h-100 shadow-sm">
                <img
                  src={product.imageUrl}
                  className="card-img-top"
                  alt={product.title}
                  style={{ height: 180, objectFit: 'cover' }}
                />
                <div className="card-body d-flex flex-column">
                  <h6 className="card-title">{product.title}</h6>
                  {product.suspended && (
                    <p className="small mb-1">
                      <span className="badge bg-warning text-dark">Hidden</span>{' '}
                      <span className="text-muted">Class {product.deviceClass} needs a verified organization</span>
                    </p>
                  )}
                  <p className="text-muted small mb-1">{product.category?.name}</p>
                  <strong className="mb-3">{formatPrice(product.price)}</strong>
                  <div className="mt-auto d-flex gap-2">
                    <Link to={`/products/${product._id}`} className="btn btn-sm btn-outline-secondary flex-grow-1">
                      View
                    </Link>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => dispatch(deleteProduct(product._id))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyListings;
