import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion } from 'framer-motion';
import axios from 'axios';
import { createProduct } from '../../actions/productActions';
import { placeholderImage } from '../../utils/placeholderImage';
import {
  CONDITIONS,
  DEVICE_CLASSES,
  LISTABLE_DEVICE_CLASSES,
  PROVINCES,
  SERVICE_TYPES
} from '../../utils/medical';

const EMPTY_RECORD = { date: '', type: 'preventive_maintenance', performedBy: '', notes: '' };
const today = new Date().toISOString().slice(0, 10);

const SellProduct = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [org, setOrg] = useState(undefined); // undefined = loading, null = none yet
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    stock: 1,
    manufacturer: '',
    deviceModel: '',
    yearOfManufacture: '',
    deviceClass: 'I',
    mdlNumber: '',
    condition: 'used_good',
    usageHours: '',
    lastServiceDate: '',
    lastCalibrationDate: '',
    province: '',
    city: ''
  });
  const [serviceHistory, setServiceHistory] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    axios.get('/api/organizations/mine')
      .then(res => {
        setOrg(res.data);
        setFormData(f => ({ ...f, province: res.data.province, city: res.data.city }));
      })
      .catch(() => setOrg(null));
    axios.get('/api/categories').then(res => {
      setCategories(res.data);
      if (res.data.length) setFormData(f => ({ ...f, category: res.data[0]._id }));
    }).catch(() => {});
  }, []);

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  const updateRecord = (i, field, value) =>
    setServiceHistory(list => list.map((r, j) => (j === i ? { ...r, [field]: value } : r)));

  const onSubmit = async e => {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);

    const data = new FormData();
    Object.entries(formData).forEach(([k, v]) => data.append(k, v));
    data.append('serviceHistory', JSON.stringify(serviceHistory));

    if (imageFile) {
      data.append('image', imageFile);
    } else {
      data.append('imageUrl', placeholderImage(formData.title || 'Equipment'));
    }

    try {
      await dispatch(createProduct(data));
      setSuccess(true);
      setTimeout(() => navigate('/my-listings'), 1500);
    } catch (err) {
      const res = err.response && err.response.data;
      setErrors(res && res.errors ? res.errors.map(x => x.msg) : ['Could not publish the listing']);
      window.scrollTo(0, 0);
    } finally {
      setSubmitting(false);
    }
  };

  if (org === undefined) return <div className="container py-4">Loading...</div>;

  if (org === null) {
    return (
      <div className="container py-5 text-center" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: '3rem' }}>🏥</div>
        <h1 className="h3 mt-3">Set up your organization first</h1>
        <p className="text-muted">
          Equipment is listed on behalf of a clinic, hospital, dealer or service company, so buyers
          know who they are dealing with.
        </p>
        <Link to="/organization" className="btn btn-primary">Create Organization Profile</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container py-5 text-center">
        <motion.div style={{ fontSize: '3rem' }} initial={{ scale: 0 }} animate={{ scale: 1 }}>✅</motion.div>
        <h2 className="mt-3">Listing created!</h2>
        <p className="text-muted">Taking you to your listings...</p>
      </div>
    );
  }

  const field = (name, label, props = {}) => (
    <>
      <label className="form-label" htmlFor={`f-${name}`}>{label}</label>
      <input id={`f-${name}`} className="form-control" name={name} value={formData[name]} onChange={onChange} {...props} />
    </>
  );

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <h1 className="mb-1">Sell Equipment</h1>
      <p className="text-muted mb-4">Listing as <strong>{org.name}</strong></p>
      {errors.length > 0 && (
        <div className="alert alert-danger">{errors.map((m, i) => <div key={i}>{m}</div>)}</div>
      )}
      <form onSubmit={onSubmit} className="card shadow-sm p-4">
        <h2 className="h5 mb-3">Listing</h2>
        <div className="mb-3">{field('title', 'Title', { required: true, placeholder: 'e.g. Vital Signs Monitor with SpO2' })}</div>
        <div className="mb-3">
          <label className="form-label" htmlFor="f-description">Description</label>
          <textarea id="f-description" className="form-control" name="description" rows="3"
            value={formData.description} onChange={onChange} required />
        </div>
        <div className="row">
          <div className="col-sm-4 mb-3">{field('price', 'Price (CAD)', { type: 'number', step: '0.01', min: '0.01', required: true })}</div>
          <div className="col-sm-4 mb-3">{field('stock', 'Units available', { type: 'number', min: '1', required: true })}</div>
          <div className="col-sm-4 mb-3">
            <label className="form-label" htmlFor="f-category">Category</label>
            <select id="f-category" className="form-select" name="category" value={formData.category} onChange={onChange} required>
              {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
            </select>
          </div>
        </div>

        <h2 className="h5 mt-2 mb-3">Device</h2>
        <div className="row">
          <div className="col-sm-4 mb-3">{field('manufacturer', 'Manufacturer', { required: true })}</div>
          <div className="col-sm-4 mb-3">{field('deviceModel', 'Model', { required: true })}</div>
          <div className="col-sm-4 mb-3">{field('yearOfManufacture', 'Year made', { type: 'number', min: '1950', max: new Date().getFullYear() })}</div>
        </div>
        <div className="row">
          <div className="col-sm-4 mb-3">
            <label className="form-label" htmlFor="f-deviceClass">Health Canada class</label>
            <select id="f-deviceClass" className="form-select" name="deviceClass" value={formData.deviceClass} onChange={onChange}>
              {Object.entries(DEVICE_CLASSES).map(([k, label]) => (
                <option key={k} value={k} disabled={!LISTABLE_DEVICE_CLASSES.includes(k)}>
                  {label}{LISTABLE_DEVICE_CLASSES.includes(k) ? '' : ' (not accepted yet)'}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-4 mb-3">{field('mdlNumber', 'MDL number (Class II)')}</div>
          <div className="col-sm-4 mb-3">
            <label className="form-label" htmlFor="f-condition">Condition</label>
            <select id="f-condition" className="form-select" name="condition" value={formData.condition} onChange={onChange}>
              {Object.entries(CONDITIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="col-sm-4 mb-3">{field('usageHours', 'Usage hours', { type: 'number', min: '0' })}</div>
          <div className="col-sm-4 mb-3">{field('lastServiceDate', 'Last service', { type: 'date', max: today })}</div>
          <div className="col-sm-4 mb-3">{field('lastCalibrationDate', 'Last calibration', { type: 'date', max: today })}</div>
        </div>

        <h2 className="h5 mt-2 mb-3">Location</h2>
        <div className="row">
          <div className="col-sm-6 mb-3">
            <label className="form-label" htmlFor="f-province">Province / territory</label>
            <select id="f-province" className="form-select" name="province" value={formData.province} onChange={onChange}>
              {Object.entries(PROVINCES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="col-sm-6 mb-3">{field('city', 'City', { required: true })}</div>
        </div>

        <div className="d-flex justify-content-between align-items-center mt-2 mb-2">
          <h2 className="h5 mb-0">Service history</h2>
          <button type="button" className="btn btn-sm btn-outline-primary"
            onClick={() => setServiceHistory(list => [...list, { ...EMPTY_RECORD }])}>
            + Add record
          </button>
        </div>
        {!serviceHistory.length && (
          <p className="text-muted small">Buyers trust listings with maintenance and calibration records.</p>
        )}
        {serviceHistory.map((r, i) => (
          <div key={i} className="border rounded p-2 mb-2">
            <div className="row g-2">
              <div className="col-sm-3">
                <input type="date" className="form-control form-control-sm" aria-label="Service date" max={today}
                  value={r.date} onChange={e => updateRecord(i, 'date', e.target.value)} required />
              </div>
              <div className="col-sm-4">
                <select className="form-select form-select-sm" aria-label="Service type"
                  value={r.type} onChange={e => updateRecord(i, 'type', e.target.value)}>
                  {Object.entries(SERVICE_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div className="col-sm-4">
                <input className="form-control form-control-sm" placeholder="Performed by" aria-label="Performed by"
                  value={r.performedBy} onChange={e => updateRecord(i, 'performedBy', e.target.value)} required />
              </div>
              <div className="col-sm-1 text-end">
                <button type="button" className="btn btn-sm btn-outline-danger" aria-label="Remove record"
                  onClick={() => setServiceHistory(list => list.filter((_, j) => j !== i))}>×</button>
              </div>
            </div>
          </div>
        ))}

        <div className="mb-3 mt-3">
          <label className="form-label" htmlFor="f-image">Photo (optional)</label>
          <input id="f-image" type="file" accept="image/*" className="form-control" onChange={e => setImageFile(e.target.files[0])} />
          <small className="text-muted">Leave empty to use a generated placeholder image.</small>
        </div>
        <motion.button type="submit" className="btn btn-primary w-100" whileTap={{ scale: 0.97 }} disabled={submitting}>
          {submitting ? 'Publishing...' : 'Publish Listing'}
        </motion.button>
      </form>
    </div>
  );
};

export default SellProduct;
