import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ORGANIZATION_TYPES, PROVINCES, VERIFICATION_BADGES } from '../../utils/medical';

const EMPTY = { name: '', type: 'clinic', province: 'ON', city: '', phone: '', website: '', mdelNumber: '' };

const errorMessages = err => {
  const data = err.response && err.response.data;
  if (data && data.errors) return data.errors.map(e => e.msg);
  return [(data && data.msg) || 'Something went wrong'];
};

// Create or edit the organization (clinic, hospital, dealer or service company)
// the user buys and sells on behalf of.
const OrganizationProfile = () => {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    axios.get('/api/organizations/mine')
      .then(res => {
        setOrg(res.data);
        setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, res.data[k] || EMPTY[k]])));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setErrors([]);
    setSaved(false);
    try {
      const res = org
        ? await axios.put('/api/organizations/mine', form)
        : await axios.post('/api/organizations', form);
      setOrg(res.data);
      setSaved(true);
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container py-4">Loading...</div>;

  const badge = org && VERIFICATION_BADGES[org.verificationStatus];

  return (
    <div className="container py-4" style={{ maxWidth: 620 }}>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <h1 className="mb-0">{org ? 'My Organization' : 'Create Your Organization'}</h1>
        {badge && <span className={`badge ${badge.className}`}>{badge.label}</span>}
      </div>
      <p className="text-muted">
        Equipment is bought and sold on behalf of a clinic, hospital, dealer or biomedical service
        company. Buyers see this profile next to your listings.
      </p>

      {errors.length > 0 && (
        <div className="alert alert-danger">{errors.map((m, i) => <div key={i}>{m}</div>)}</div>
      )}
      {saved && (
        <motion.div className="alert alert-success" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          Saved. <Link to="/sell">List a piece of equipment →</Link>
        </motion.div>
      )}

      <form onSubmit={onSubmit} className="card shadow-sm p-4">
        <div className="mb-3">
          <label className="form-label" htmlFor="org-name">Organization name</label>
          <input id="org-name" className="form-control" name="name" value={form.name} onChange={onChange} required />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="org-type">Type</label>
          <select id="org-type" className="form-select" name="type" value={form.type} onChange={onChange}>
            {Object.entries(ORGANIZATION_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="row">
          <div className="col-sm-6 mb-3">
            <label className="form-label" htmlFor="org-province">Province / territory</label>
            <select id="org-province" className="form-select" name="province" value={form.province} onChange={onChange}>
              {Object.entries(PROVINCES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="col-sm-6 mb-3">
            <label className="form-label" htmlFor="org-city">City</label>
            <input id="org-city" className="form-control" name="city" value={form.city} onChange={onChange} required />
          </div>
        </div>
        <div className="row">
          <div className="col-sm-6 mb-3">
            <label className="form-label" htmlFor="org-phone">Phone (optional)</label>
            <input id="org-phone" className="form-control" name="phone" value={form.phone} onChange={onChange} />
          </div>
          <div className="col-sm-6 mb-3">
            <label className="form-label" htmlFor="org-website">Website (optional)</label>
            <input id="org-website" type="url" className="form-control" name="website" placeholder="https://"
              value={form.website} onChange={onChange} />
          </div>
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="org-mdel">Health Canada MDEL number (dealers)</label>
          <input id="org-mdel" className="form-control" name="mdelNumber" value={form.mdelNumber} onChange={onChange} />
          <small className="text-muted">
            Medical Device Establishment Licence. Dealers and distributors will need it once seller verification launches.
          </small>
        </div>
        <motion.button type="submit" className="btn btn-primary w-100" whileTap={{ scale: 0.97 }} disabled={saving}>
          {saving ? 'Saving...' : org ? 'Save Changes' : 'Create Organization'}
        </motion.button>
      </form>
    </div>
  );
};

export default OrganizationProfile;
