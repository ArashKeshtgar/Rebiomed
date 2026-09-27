import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { getOrders } from '../../actions/orderActions';
import { FULFILLMENT_STATUSES, formatPrice, formatTimestamp } from '../../utils/medical';

const STATUS_BADGE = {
  paid: 'bg-success',
  processing: 'bg-warning text-dark',
  refunded: 'bg-secondary',
  failed: 'bg-danger'
};

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

// One seller's part of an order, with the buyer's actions for it.
const FulfillmentCard = ({ order, fulfillment, onChanged }) => {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = FULFILLMENT_STATUSES[fulfillment.status];
  const orgId = fulfillment.organization?._id || fulfillment.organization;
  const items = order.items.filter(i => i.organization === orgId);
  const base = `/api/orders/${order._id}/fulfillments/${fulfillment._id}`;

  const act = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`${base}/${path}`, body);
      setReporting(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded p-3 mb-2">
      <div className="d-flex justify-content-between flex-wrap gap-2">
        <strong>{fulfillment.organization?.name || 'Seller'}</strong>
        <span className={`badge ${status.className}`}>{status.label}</span>
      </div>
      <ul className="list-unstyled small my-2">
        {items.map((item, idx) => (
          <li key={idx}>{item.title} × {item.quantity} — {formatPrice(item.price * item.quantity)}</li>
        ))}
      </ul>

      {fulfillment.status === 'awaiting_shipment' && (
        <p className="small text-muted mb-2">The seller will contact you to arrange freight. Your payment is held by ReBiomed until you confirm delivery.</p>
      )}
      {fulfillment.shippedAt && (
        <p className="small mb-2">
          Shipped {formatTimestamp(fulfillment.shippedAt)}
          {fulfillment.carrier && <> via {fulfillment.carrier}</>}
          {fulfillment.trackingNumber && <> · tracking <code>{fulfillment.trackingNumber}</code></>}
        </p>
      )}
      {fulfillment.status === 'shipped' && (
        <p className="small text-muted mb-2">Inspect the equipment when it arrives. The seller is paid only after you confirm delivery.</p>
      )}
      {fulfillment.cancelReason && fulfillment.status === 'cancelled' && (
        <p className="small mb-2">Seller's reason: {fulfillment.cancelReason}. This part has been refunded.</p>
      )}
      {fulfillment.dispute && (
        <p className="small mb-2">
          You reported: “{fulfillment.dispute.reason}”
          {fulfillment.dispute.resolution
            ? <> — resolved: {fulfillment.dispute.resolution === 'refund' ? 'refunded to you' : fulfillment.status === 'delivered' ? 'payment released to the seller' : 'the order continues'}{fulfillment.dispute.note && <> ({fulfillment.dispute.note})</>}</>
            : <> — under review by ReBiomed. The seller's payment is on hold.</>}
        </p>
      )}

      {error && <div className="alert alert-danger py-1 small">{error}</div>}

      {reporting ? (
        <div>
          <textarea className="form-control form-control-sm mb-2" rows="2" aria-label="Describe the problem"
            placeholder="What's wrong? e.g. arrived damaged, wrong model, not received"
            value={reason} onChange={e => setReason(e.target.value)} />
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-warning" disabled={busy || !reason.trim()} onClick={() => act('dispute', { reason })}>
              Submit Report
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setReporting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="d-flex gap-2 flex-wrap">
          {fulfillment.status === 'shipped' && (
            <button className="btn btn-sm btn-success" disabled={busy} onClick={() => act('confirm-delivery')}>
              Confirm Delivery
            </button>
          )}
          {(fulfillment.status === 'shipped' || fulfillment.status === 'awaiting_shipment') && (
            <button className="btn btn-sm btn-outline-warning" disabled={busy} onClick={() => setReporting(true)}>
              Report a Problem
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const OrderHistory = () => {
  const dispatch = useDispatch();
  const { orders, loading } = useSelector(state => state.orders);

  useEffect(() => {
    dispatch(getOrders());
  }, [dispatch]);

  const refresh = () => dispatch(getOrders());

  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="mb-4">My Orders</h1>
      {loading ? (
        <p>Loading...</p>
      ) : !orders.length ? (
        <p>You haven't placed any orders yet.</p>
      ) : (
        orders.map(order => (
          <div key={order._id} className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between mb-2">
                <span className="text-muted">{new Date(order.createdAt).toLocaleString()}</span>
                <span className={`badge ${STATUS_BADGE[order.status] || 'bg-secondary'}`}>{order.status}</span>
              </div>
              {order.fulfillments && order.fulfillments.length ? (
                order.fulfillments.map(f => (
                  <FulfillmentCard key={f._id} order={order} fulfillment={f} onChanged={refresh} />
                ))
              ) : (
                <ul className="list-unstyled mt-2 mb-2">
                  {order.items.map((item, idx) => (
                    <li key={idx}>{item.title} × {item.quantity} — {formatPrice(item.price * item.quantity)}</li>
                  ))}
                </ul>
              )}
              <strong>Total: {formatPrice(order.total)}</strong>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default OrderHistory;
