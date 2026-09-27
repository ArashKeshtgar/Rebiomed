import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FULFILLMENT_STATUSES, PAYOUT_STATUSES, formatCents, formatPrice, formatTimestamp } from '../../utils/medical';

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

const SaleCard = ({ sale, onChanged }) => {
  const { orderId, fulfillment: f } = sale;
  const [mode, setMode] = useState(null); // 'ship' | 'cancel' | null
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = FULFILLMENT_STATUSES[f.status];
  const base = `/api/sales/${orderId}/fulfillments/${f._id}`;

  const act = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${base}/${path}`, body);
      setMode(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <div className="text-muted small">Order placed {formatTimestamp(sale.createdAt)}</div>
            <div>Buyer: <strong>{sale.buyer?.name}</strong> · <a href={`mailto:${sale.buyer?.email}`}>{sale.buyer?.email}</a></div>
          </div>
          <span className={`badge align-self-start ${status.className}`}>{status.label}</span>
        </div>

        <ul className="list-unstyled small my-2">
          {sale.items.map((item, i) => (
            <li key={i}>{item.title} × {item.quantity} — {formatPrice(item.price * item.quantity)}</li>
          ))}
        </ul>

        <div className="small bg-light rounded p-2 mb-2">
          Sale {formatCents(f.subtotalCents)} − ReBiomed fee {formatCents(f.platformFeeCents)} = <strong>you receive {formatCents(f.payout.amountCents)}</strong>
          <div className="text-muted">
            {f.status === 'refunded' || f.status === 'cancelled' ? 'Refunded to the buyer — no payout.' : PAYOUT_STATUSES[f.payout.status]}
            {f.payout.status === 'pending' && <> · <Link to="/organization">Set up payouts</Link></>}
          </div>
        </div>

        {f.shippedAt && (
          <p className="small mb-2">
            Shipped {formatTimestamp(f.shippedAt)}{f.carrier && <> via {f.carrier}</>}
            {f.trackingNumber && <> · <code>{f.trackingNumber}</code></>}
          </p>
        )}
        {f.dispute && !f.dispute.resolution && (
          <div className="alert alert-warning small py-2">
            The buyer reported a problem: “{f.dispute.reason}”. ReBiomed is reviewing it; the payment is on hold.
          </div>
        )}
        {f.dispute?.resolution && (
          <p className="small mb-2">Dispute resolved: {f.dispute.resolution === 'refund' ? 'buyer refunded' : f.status === 'delivered' ? 'payment released to you' : 'the order continues — please ship'}{f.dispute.note && <> ({f.dispute.note})</>}.</p>
        )}

        {error && <div className="alert alert-danger py-1 small">{error}</div>}

        {f.status === 'awaiting_shipment' && mode === null && (
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={() => setMode('ship')}>Mark as Shipped</button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => setMode('cancel')}>Cancel & Refund</button>
          </div>
        )}
        {mode === 'ship' && (
          <div className="row g-2 align-items-end">
            <div className="col-sm-4">
              <label className="form-label small" htmlFor={`carrier-${f._id}`}>Carrier (optional)</label>
              <input id={`carrier-${f._id}`} className="form-control form-control-sm" placeholder="e.g. Purolator, own truck"
                value={carrier} onChange={e => setCarrier(e.target.value)} />
            </div>
            <div className="col-sm-4">
              <label className="form-label small" htmlFor={`tracking-${f._id}`}>Tracking number (optional)</label>
              <input id={`tracking-${f._id}`} className="form-control form-control-sm"
                value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>
            <div className="col-sm-4 d-flex gap-2">
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => act('ship', { carrier, trackingNumber })}>Confirm</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        )}
        {mode === 'cancel' && (
          <div>
            <textarea className="form-control form-control-sm mb-2" rows="2" aria-label="Cancellation reason"
              placeholder="Why can't this be shipped? The buyer will see this."
              value={reason} onChange={e => setReason(e.target.value)} />
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-danger" disabled={busy || !reason.trim()} onClick={() => act('cancel', { reason })}>
                Cancel and Refund Buyer
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Seller's orders: arrange freight with the buyer, mark shipped, track payouts.
const SalesPage = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    axios.get('/api/sales')
      .then(res => { setSales(res.data); setError(''); })
      .catch(err => setError(err.response && err.response.status === 404
        ? 'Create your organization to start selling.'
        : errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="mb-1">My Sales</h1>
      <p className="text-muted">Buyers pay ReBiomed at checkout. You're paid once the buyer confirms the equipment arrived.</p>
      {error && <div className="alert alert-info">{error}</div>}
      {loading ? <p>Loading...</p> : !sales.length && !error ? (
        <p className="text-muted">No sales yet.</p>
      ) : (
        sales.map(s => <SaleCard key={s.fulfillment._id} sale={s} onChanged={load} />)
      )}
    </div>
  );
};

export default SalesPage;
