import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import {
  DOCUMENT_KINDS,
  ORGANIZATION_TYPES,
  PROVINCES,
  VERIFICATION_BADGES,
  formatTimestamp
} from '../../utils/medical';
import { downloadDocument } from '../../utils/downloadDocument';

const EMPTY = { name: '', type: 'clinic', province: 'ON', city: '', phone: '', website: '', mdelNumber: '' };

const errorMessages = err => {
  const data = err.response && err.response.data;
  if (data && data.errors) return data.errors.map(e => e.msg);
  return [(data && data.msg) || 'Something went wrong'];
};

const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Status-specific explanation and the one action the seller can take next.
const VerificationPanel = ({ org, busy, onRequest }) => {
  const status = org.verificationStatus;
  const canRequest = status === 'unverified' || status === 'rejected';
  const text = {
    unverified: 'Upload a supporting document, then request verification. Verified sellers get a badge on every listing and can list Class III devices.',
    pending: 'Your documents are with our team for review. Documents cannot be removed until the review is finished.',
    verified: `Verified on ${formatTimestamp(org.verifiedAt)}. Changing your organization's name, type, location or MDEL number will send it back for review.`,
    rejected: 'Verification was not approved. Fix the issue below, then request verification again.'
  }[status];

  return (
    <div className={`alert ${status === 'verified' ? 'alert-success' : status === 'rejected' ? 'alert-danger' : 'alert-secondary'}`}>
      <p className="mb-2">{text}</p>
      {status === 'rejected' && org.verificationNote && (
        <p className="mb-2"><strong>Reviewer's note:</strong> {org.verificationNote}</p>
      )}
      {canRequest && (
        <button className="btn btn-sm btn-primary" onClick={onRequest} disabled={busy || !org.documents.length}>
          {busy ? 'Submitting...' : 'Request Verification'}
        </button>
      )}
    </div>
  );
};

const DocumentsSection = ({ org, onChange, setErrors }) => {
  const [kind, setKind] = useState('mdel_licence');
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const locked = org.verificationStatus === 'pending';

  const onUpload = async e => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErrors([]);
    const data = new FormData();
    data.append('kind', kind);
    data.append('document', file);
    try {
      const res = await axios.post('/api/organizations/mine/documents', data);
      onChange(res.data);
      setFile(null);
      setInputKey(k => k + 1);
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async doc => {
    setErrors([]);
    try {
      onChange((await axios.delete(`/api/organizations/mine/documents/${doc._id}`)).data);
    } catch (err) {
      setErrors(errorMessages(err));
    }
  };

  const onDownload = doc => downloadDocument(org._id, doc).catch(err => setErrors(errorMessages(err)));

  return (
    <div className="card shadow-sm p-4 mt-4">
      <h2 className="h5">Verification documents</h2>
      <p className="text-muted small">
        PDF, PNG or JPEG, up to 5 MB each. Only you and ReBiomed reviewers can see these files.
      </p>
      {!org.documents.length ? (
        <p className="text-muted">No documents yet.</p>
      ) : (
        <ul className="list-group mb-3">
          {org.documents.map(doc => (
            <li key={doc._id} className="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <div>
                <div>{DOCUMENT_KINDS[doc.kind]}</div>
                <small className="text-muted">{doc.originalName} · {formatSize(doc.size)} · {formatTimestamp(doc.uploadedAt)}</small>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => onDownload(doc)}>Download</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => onRemove(doc)} disabled={locked}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onUpload} className="row g-2 align-items-end">
        <div className="col-sm-5">
          <label className="form-label small" htmlFor="doc-kind">Document type</label>
          <select id="doc-kind" className="form-select form-select-sm" value={kind} onChange={e => setKind(e.target.value)}>
            {Object.entries(DOCUMENT_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="col-sm-5">
          <label className="form-label small" htmlFor="doc-file">File</label>
          <input key={inputKey} id="doc-file" type="file" accept="application/pdf,image/png,image/jpeg"
            className="form-control form-control-sm" onChange={e => setFile(e.target.files[0] || null)} />
        </div>
        <div className="col-sm-2">
          <button type="submit" className="btn btn-sm btn-outline-primary w-100" disabled={!file || uploading}>
            {uploading ? '...' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
};

// Stripe Connect payouts. Sellers are sent to Stripe's hosted onboarding and
// come back to /organization?stripe=return (or =refresh if the link expired).
const PayoutsSection = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const back = searchParams.get('stripe');
    const request = back === 'return'
      ? axios.post('/api/payouts/refresh')
      : axios.get('/api/payouts/status');
    request
      .then(res => setState(res.data))
      .catch(err => setError(errorMessages(err)[0]));
    if (back === 'refresh') setError('That setup link expired. Continue setting up payouts below.');
    if (back) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on arrival

  const go = async (path) => {
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`/api/payouts/${path}`);
      window.location.assign(res.data.url);
    } catch (err) {
      setError(errorMessages(err)[0]);
      setBusy(false);
    }
  };

  return (
    <div className="card shadow-sm p-4 mt-4">
      <h2 className="h5">Payouts</h2>
      <p className="text-muted small">
        Buyers pay ReBiomed at checkout. When a buyer confirms delivery, your share (minus the ReBiomed fee) is sent to
        your Stripe account. Stripe handles your bank details and identity checks; ReBiomed never sees them.
      </p>
      {error && <div className="alert alert-warning py-2 small">{error}</div>}
      {!state ? null : state.payoutsEnabled ? (
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="badge bg-success">Payouts active</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => go('dashboard-link')}>
            Open Stripe Dashboard
          </button>
        </div>
      ) : (
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="badge bg-secondary">{state.detailsSubmitted ? 'Stripe is reviewing your details' : 'Not set up'}</span>
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => go('onboarding')}>
            {busy ? 'Opening Stripe...' : state.connected ? 'Continue Payout Setup' : 'Set Up Payouts with Stripe'}
          </button>
        </div>
      )}
    </div>
  );
};

// Create or edit the organization (clinic, hospital, dealer or service company)
// the user buys and sells on behalf of, and manage its verification.
const OrganizationProfile = () => {
  const [org, setOrg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  const load = data => {
    setOrg(data);
    setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, data[k] || EMPTY[k]])));
  };

  useEffect(() => {
    axios.get('/api/organizations/mine')
      .then(res => load(res.data))
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
      load(res.data);
      setSaved(true);
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setSaving(false);
    }
  };

  const onRequestVerification = async () => {
    setRequesting(true);
    setErrors([]);
    try {
      load((await axios.post('/api/organizations/mine/verification-request')).data);
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <div className="container py-4">Loading...</div>;

  const badge = org && VERIFICATION_BADGES[org.verificationStatus];

  return (
    <div className="container py-4" style={{ maxWidth: 680 }}>
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

      {org && <VerificationPanel org={org} busy={requesting} onRequest={onRequestVerification} />}

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
          <label className="form-label" htmlFor="org-mdel">Health Canada MDEL number {form.type === 'dealer' ? '(required for dealers)' : '(dealers)'}</label>
          <input id="org-mdel" className="form-control" name="mdelNumber" value={form.mdelNumber} onChange={onChange} />
          <small className="text-muted">Medical Device Establishment Licence, held by dealers and distributors.</small>
        </div>
        <motion.button type="submit" className="btn btn-primary w-100" whileTap={{ scale: 0.97 }} disabled={saving}>
          {saving ? 'Saving...' : org ? 'Save Changes' : 'Create Organization'}
        </motion.button>
      </form>

      {org && <PayoutsSection />}
      {org && <DocumentsSection org={org} onChange={load} setErrors={setErrors} />}
    </div>
  );
};

export default OrganizationProfile;
