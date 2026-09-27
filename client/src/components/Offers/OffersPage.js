import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import { addOfferToCart } from '../../actions/cartActions';
import { OFFER_STATUSES, formatCents, formatDeadline, formatPrice, formatTimestamp } from '../../utils/medical';

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

// One offer, from either side of the negotiation.
const OfferCard = ({ offer, role, onChanged }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // 'counter' | 'decline' | null
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = OFFER_STATUSES[offer.status];
  const product = offer.product || {};

  const act = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`/api/offers/${offer._id}/${path}`, body);
      setMode(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const buy = () => {
    dispatch(addOfferToCart(offer));
    navigate('/cart');
  };

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body d-flex gap-3 flex-wrap">
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.title} width="88" height="88" className="rounded" style={{ objectFit: 'cover' }} />
        )}
        <div className="flex-grow-1" style={{ minWidth: 220 }}>
          <div className="d-flex justify-content-between flex-wrap gap-2">
            <Link to={`/products/${product._id}`} className="fw-semibold">{product.title}</Link>
            <span className={`badge align-self-start ${status.className}`}>{status.label}</span>
          </div>
          <div className="small text-muted mb-2">
            {role === 'buyer' ? <>Seller: {offer.organization?.name}</> : <>From {offer.buyer?.name} · <a href={`mailto:${offer.buyer?.email}`}>{offer.buyer?.email}</a></>}
            {' '}· listed at {formatPrice(product.price)} · offered {formatTimestamp(offer.createdAt)}
          </div>

          <div className="small">
            Offer: <strong>{formatCents(offer.amountCents)}</strong>
            {offer.counterAmountCents && <> · Counter: <strong>{formatCents(offer.counterAmountCents)}</strong></>}
            {offer.agreedAmountCents && <> · Agreed: <strong className="text-success">{formatCents(offer.agreedAmountCents)}</strong></>}
          </div>
          {offer.message && <div className="small text-muted">Buyer: “{offer.message}”</div>}
          {offer.sellerNote && <div className="small text-muted">Seller: “{offer.sellerNote}”</div>}
          {(offer.status === 'pending' || offer.status === 'countered') && (
            <div className="small text-muted">Response due by {formatDeadline(offer.expiresAt)}</div>
          )}
          {offer.status === 'accepted' && (
            <div className="small text-muted">
              {role === 'buyer' ? 'Check out' : 'The buyer can check out'} at this price until {formatDeadline(offer.acceptedUntil)}
            </div>
          )}

          {error && <div className="alert alert-danger py-1 small mt-2 mb-0">{error}</div>}

          <div className="mt-2">
            {role === 'buyer' && (
              <div className="d-flex gap-2 flex-wrap">
                {offer.status === 'accepted' && (
                  <button className="btn btn-sm btn-success" onClick={buy} disabled={product.stock < 1}>
                    {product.stock < 1 ? 'Sold out' : `Buy at ${formatCents(offer.agreedAmountCents)}`}
                  </button>
                )}
                {offer.status === 'countered' && (
                  <button className="btn btn-sm btn-success" disabled={busy} onClick={() => act('accept-counter')}>
                    Accept {formatCents(offer.counterAmountCents)}
                  </button>
                )}
                {['pending', 'countered', 'accepted'].includes(offer.status) && (
                  <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => act('withdraw')}>Withdraw</button>
                )}
              </div>
            )}

            {role === 'seller' && offer.status === 'pending' && mode === null && (
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-sm btn-success" disabled={busy} onClick={() => act('accept')}>
                  Accept {formatCents(offer.amountCents)}
                </button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => setMode('counter')}>Counter…</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => setMode('decline')}>Decline…</button>
              </div>
            )}
            {role === 'seller' && offer.status === 'countered' && (
              <div className="small text-muted">Waiting for the buyer to answer your counter-offer.</div>
            )}
            {mode === 'counter' && (
              <div className="row g-2 align-items-end">
                <div className="col-sm-3">
                  <label className="form-label small" htmlFor={`counter-${offer._id}`}>Your price (CAD)</label>
                  <input id={`counter-${offer._id}`} type="number" step="0.01" min="0.01" className="form-control form-control-sm"
                    value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div className="col-sm-6">
                  <label className="form-label small" htmlFor={`cnote-${offer._id}`}>Note (optional)</label>
                  <input id={`cnote-${offer._id}`} className="form-control form-control-sm" value={note} onChange={e => setNote(e.target.value)} />
                </div>
                <div className="col-sm-3 d-flex gap-2">
                  <button className="btn btn-sm btn-primary" disabled={busy || !amount} onClick={() => act('counter', { amount, note })}>Send</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setMode(null)}>Back</button>
                </div>
              </div>
            )}
            {mode === 'decline' && (
              <div className="d-flex gap-2 flex-wrap align-items-end">
                <input className="form-control form-control-sm" style={{ maxWidth: 360 }} aria-label="Reason (optional)"
                  placeholder="Reason (optional, shown to the buyer)" value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act('decline', { note })}>Decline</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setMode(null)}>Back</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TABS = { made: 'Offers I Made', received: 'Offers Received' };

const OffersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'received' ? 'received' : 'made';
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    axios.get(tab === 'made' ? '/api/offers/mine' : '/api/offers/received')
      .then(res => { setOffers(res.data); setError(''); })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(load, [load]);

  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="mb-3">Offers</h1>
      <ul className="nav nav-tabs mb-4">
        {Object.entries(TABS).map(([key, label]) => (
          <li className="nav-item" key={key}>
            <button className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setSearchParams(key === 'made' ? {} : { tab: key })}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? <p>Loading...</p> : !offers.length ? (
        <p className="text-muted">{tab === 'made' ? "You haven't made any offers yet." : 'No offers on your listings yet.'}</p>
      ) : (
        offers.map(o => <OfferCard key={o._id} offer={o} role={tab === 'made' ? 'buyer' : 'seller'} onChanged={load} />)
      )}
    </div>
  );
};

export default OffersPage;
