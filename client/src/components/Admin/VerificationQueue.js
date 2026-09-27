import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import AdminTabs from './AdminTabs';
import {
  DOCUMENT_KINDS,
  ORGANIZATION_TYPES,
  PROVINCES,
  VERIFICATION_BADGES,
  formatTimestamp
} from '../../utils/medical';
import { downloadDocument } from '../../utils/downloadDocument';

const TABS = [
  { status: 'pending', label: 'Awaiting review' },
  { status: 'verified', label: 'Verified' },
  { status: 'rejected', label: 'Rejected' }
];

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

const OrganizationReview = ({ org, onDecided }) => {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isVerified = org.verificationStatus === 'verified';

  const decide = async (action) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`/api/admin/organizations/${org._id}/${action}`, action === 'reject' ? { note } : {});
      onDecided(org._id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="card shadow-sm mb-3"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60 }}
    >
      <div className="card-body">
        <div className="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <h2 className="h5 mb-1">{org.name}</h2>
            <div className="text-muted small">
              {ORGANIZATION_TYPES[org.type]} · {org.city}, {PROVINCES[org.province]}
              {org.mdelNumber && <> · MDEL <strong>{org.mdelNumber}</strong></>}
            </div>
            <div className="text-muted small">
              Owner: {org.owner?.name} ({org.owner?.email}) · Registered {formatTimestamp(org.createdAt)}
            </div>
          </div>
          <span className={`badge align-self-start ${VERIFICATION_BADGES[org.verificationStatus].className}`}>
            {VERIFICATION_BADGES[org.verificationStatus].label}
          </span>
        </div>

        <h3 className="h6 mt-3">Documents</h3>
        {!org.documents.length ? (
          <p className="text-muted small">No documents uploaded.</p>
        ) : (
          <ul className="list-unstyled small mb-2">
            {org.documents.map(doc => (
              <li key={doc._id} className="mb-1">
                <button className="btn btn-link btn-sm p-0 me-2"
                  onClick={() => downloadDocument(org._id, doc).catch(err => setError(errorMessage(err)))}>
                  {doc.originalName}
                </button>
                <span className="text-muted">{DOCUMENT_KINDS[doc.kind]} · uploaded {formatTimestamp(doc.uploadedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        {org.verificationHistory?.length > 0 && (
          <>
            <h3 className="h6 mt-3">History</h3>
            <ul className="list-unstyled small text-muted mb-2">
              {org.verificationHistory.map((e, i) => (
                <li key={i}>
                  {formatTimestamp(e.at)} — {e.status}{e.by?.name ? ` by ${e.by.name}` : ''}{e.note ? `: ${e.note}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        {org.verificationStatus !== 'rejected' && (
          rejecting ? (
            <div className="mt-3">
              <label className="form-label small" htmlFor={`note-${org._id}`}>
                {isVerified ? 'Reason for revoking (shown to the seller)' : 'Reason for rejecting (shown to the seller)'}
              </label>
              <textarea id={`note-${org._id}`} className="form-control form-control-sm mb-2" rows="2"
                value={note} onChange={e => setNote(e.target.value)} />
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-danger" disabled={busy || !note.trim()} onClick={() => decide('reject')}>
                  {isVerified ? 'Revoke Verification' : 'Reject'}
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setRejecting(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="d-flex gap-2 mt-3">
              {!isVerified && (
                <button className="btn btn-sm btn-success" disabled={busy} onClick={() => decide('verify')}>Verify</button>
              )}
              <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => setRejecting(true)}>
                {isVerified ? 'Revoke…' : 'Reject…'}
              </button>
            </div>
          )
        )}
      </div>
    </motion.div>
  );
};

// Admin-only: review the documents organizations submit and verify or reject them.
// The server enforces admin rights on every call; this page only hides the UI.
const VerificationQueue = () => {
  const [status, setStatus] = useState('pending');
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    axios.get('/api/admin/organizations', { params: { status } })
      .then(res => setOrgs(res.data))
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(load, [load]);

  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="mb-3">Admin</h1>
      <AdminTabs />
      <div className="btn-group mb-4" role="group" aria-label="Filter by status">
        {TABS.map(t => (
          <button key={t.status} className={`btn btn-sm ${status === t.status ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setStatus(t.status)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? (
        <p>Loading...</p>
      ) : !orgs.length ? (
        <p className="text-muted">Nothing here.</p>
      ) : (
        <AnimatePresence>
          {orgs.map(org => (
            <OrganizationReview key={org._id} org={org} onDecided={id => setOrgs(list => list.filter(o => o._id !== id))} />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
};

export default VerificationQueue;
