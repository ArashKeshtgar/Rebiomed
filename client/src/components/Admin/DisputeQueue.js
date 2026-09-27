import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import AdminTabs from './AdminTabs';
import { formatCents, formatPrice, formatTimestamp } from '../../utils/medical';

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

const DisputeCard = ({ dispute, onResolved }) => {
  const { orderId, fulfillment: f } = dispute;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resolve = async (action) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`/api/admin/orders/${orderId}/fulfillments/${f._id}/resolve`, { action, note });
      onResolved(f._id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <motion.div className="card shadow-sm mb-3" layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60 }}>
      <div className="card-body">
        <div className="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <div><strong>{f.organization?.name}</strong> → {dispute.buyer?.name} ({dispute.buyer?.email})</div>
            <div className="text-muted small">
              Ordered {formatTimestamp(dispute.createdAt)} · reported {formatTimestamp(f.dispute.openedAt)}
              {f.shippedAt ? <> · shipped {formatTimestamp(f.shippedAt)}{f.carrier && <> via {f.carrier}</>}</> : <> · not shipped</>}
            </div>
          </div>
          <strong>{formatCents(f.subtotalCents)} on hold</strong>
        </div>
        <ul className="list-unstyled small my-2">
          {dispute.items.map((item, i) => (
            <li key={i}>{item.title} × {item.quantity} — {formatPrice(item.price * item.quantity)}</li>
          ))}
        </ul>
        <div className="alert alert-warning py-2 small mb-2">Buyer: “{f.dispute.reason}”</div>
        {error && <div className="alert alert-danger py-1 small">{error}</div>}
        <label className="form-label small" htmlFor={`note-${f._id}`}>Decision note (shown to buyer and seller)</label>
        <textarea id={`note-${f._id}`} className="form-control form-control-sm mb-2" rows="2"
          value={note} onChange={e => setNote(e.target.value)} />
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-sm btn-outline-danger" disabled={busy || !note.trim()} onClick={() => resolve('refund')}>
            Refund Buyer
          </button>
          <button className="btn btn-sm btn-outline-success" disabled={busy || !note.trim()} onClick={() => resolve('release')}>
            {f.shippedAt ? 'Release Payment to Seller' : 'Dismiss — Seller Ships'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Admin-only: buyer-reported problems whose payment is on hold.
const DisputeQueue = () => {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    axios.get('/api/admin/disputes')
      .then(res => setDisputes(res.data))
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="mb-3">Admin</h1>
      <AdminTabs />
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? <p>Loading...</p> : !disputes.length ? (
        <p className="text-muted">No open disputes.</p>
      ) : (
        <AnimatePresence>
          {disputes.map(d => (
            <DisputeCard key={d.fulfillment._id} dispute={d}
              onResolved={id => setDisputes(list => list.filter(x => x.fulfillment._id !== id))} />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
};

export default DisputeQueue;
