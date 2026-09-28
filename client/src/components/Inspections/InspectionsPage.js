import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  CHECK_RESULTS,
  INSPECTION_CHECKS,
  INSPECTION_OUTCOMES,
  INSPECTION_STATUSES,
  PROVINCES,
  formatDate,
  formatTimestamp
} from '../../utils/medical';

const errorMessage = err => (err.response && err.response.data && err.response.data.msg) || 'Something went wrong';

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Seller: pick a verified service provider to inspect one listing.
const RequestForm = ({ productId, onDone }) => {
  const [product, setProduct] = useState(null);
  const [inspectors, setInspectors] = useState(null);
  const [inspectorId, setInspectorId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/products/${productId}`).then(res => setProduct(res.data)).catch(() => setError('Listing not found'));
    axios.get('/api/inspections/inspectors').then(res => setInspectors(res.data)).catch(() => setInspectors([]));
  }, [productId]);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await axios.post('/api/inspections', { productId, inspectorOrganizationId: inspectorId, note });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Nearby inspectors first.
  const sorted = (inspectors || []).slice().sort((a, b) =>
    (b.province === product?.location?.province) - (a.province === product?.location?.province));

  return (
    <form onSubmit={submit} className="card shadow-sm mb-4">
      <div className="card-body">
        <h2 className="h5">Request an independent inspection</h2>
        {product && <p className="mb-2"><strong>{product.title}</strong> <span className="text-muted">· {product.location?.city}, {product.location?.province}</span></p>}
        {inspectors && !inspectors.length ? (
          <p className="text-muted mb-0">No verified biomedical service providers are available yet.</p>
        ) : (
          <>
            <div className="mb-2">
              <label className="form-label small" htmlFor="inspector">Inspector</label>
              <select id="inspector" className="form-select" required value={inspectorId} onChange={e => setInspectorId(e.target.value)}>
                <option value="">Choose a verified service provider…</option>
                {sorted.map(o => (
                  <option key={o._id} value={o._id}>{o.name} — {o.city}, {PROVINCES[o.province]}</option>
                ))}
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label small" htmlFor="inspection-note">Note for the inspector (optional)</label>
              <textarea id="inspection-note" className="form-control" rows="2" maxLength="1000"
                placeholder="Access hours, where the device is, what to focus on…" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <p className="small text-muted">
              The inspector contacts you to arrange the visit and bills you directly. Their report is published
              on the listing whatever the result, and you can't edit or remove it.
            </p>
            {error && <div className="alert alert-danger py-1 small">{error}</div>}
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={busy || !inspectorId}>{busy ? 'Sending…' : 'Send request'}</button>
              <button type="button" className="btn btn-outline-secondary" onClick={onDone}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </form>
  );
};

// Inspector: the structured report.
const ReportForm = ({ inspection, onDone, onCancel }) => {
  const [fields, setFields] = useState({
    inspectedAt: todayLocal(), technicianName: '', credential: '', serialNumber: '', outcome: 'pass', summary: ''
  });
  const [checks, setChecks] = useState(
    Object.keys(INSPECTION_CHECKS).map(item => ({ item, result: 'pass', notes: '' }))
  );
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = key => e => setFields(f => ({ ...f, [key]: e.target.value }));
  const setCheck = (i, key, value) => setChecks(cs => cs.map((c, j) => (j === i ? { ...c, [key]: value } : c)));
  const anyFail = checks.some(c => c.result === 'fail');
  const electricalFail = checks.some(c => c.item === 'electrical_safety' && c.result === 'fail');

  // Mirrors the server's rules: failed checks rule out a clean pass, and a
  // failed electrical safety test fails the device.
  useEffect(() => {
    setFields(f => {
      if (electricalFail && f.outcome !== 'fail') return { ...f, outcome: 'fail' };
      if (anyFail && f.outcome === 'pass') return { ...f, outcome: 'pass_with_findings' };
      return f;
    });
  }, [anyFail, electricalFail]);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData();
    Object.entries(fields).forEach(([k, v]) => data.append(k, v));
    data.append('checks', JSON.stringify(checks));
    if (file) data.append('attachment', file);
    try {
      await axios.post(`/api/inspections/${inspection._id}/report`, data);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const id = key => `${key}-${inspection._id}`;
  return (
    <form onSubmit={submit} className="border rounded p-3 mt-3">
      <h3 className="h6">Inspection report</h3>
      <div className="row g-2 mb-2">
        <div className="col-sm-3">
          <label className="form-label small" htmlFor={id('date')}>Date inspected</label>
          <input id={id('date')} type="date" className="form-control form-control-sm" required max={todayLocal()}
            value={fields.inspectedAt} onChange={set('inspectedAt')} />
        </div>
        <div className="col-sm-3">
          <label className="form-label small" htmlFor={id('tech')}>Technician</label>
          <input id={id('tech')} className="form-control form-control-sm" required value={fields.technicianName} onChange={set('technicianName')} />
        </div>
        <div className="col-sm-3">
          <label className="form-label small" htmlFor={id('cred')}>Credential</label>
          <input id={id('cred')} className="form-control form-control-sm" required placeholder="e.g. CET, CBET"
            value={fields.credential} onChange={set('credential')} />
        </div>
        <div className="col-sm-3">
          <label className="form-label small" htmlFor={id('serial')}>Serial no. (on device)</label>
          <input id={id('serial')} className="form-control form-control-sm" required value={fields.serialNumber} onChange={set('serialNumber')} />
        </div>
      </div>

      <table className="table table-sm align-middle mb-2">
        <thead><tr><th>Check</th><th style={{ width: 130 }}>Result</th><th>Notes</th></tr></thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={c.item}>
              <td>
                {INSPECTION_CHECKS[c.item].label}
                <div className="text-muted small">{INSPECTION_CHECKS[c.item].hint}</div>
              </td>
              <td>
                <select className="form-select form-select-sm" aria-label={`${INSPECTION_CHECKS[c.item].label} result`}
                  value={c.result} onChange={e => setCheck(i, 'result', e.target.value)}>
                  {Object.entries(CHECK_RESULTS).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                </select>
              </td>
              <td>
                <input className="form-control form-control-sm" aria-label={`${INSPECTION_CHECKS[c.item].label} notes`}
                  required={c.result === 'fail'} placeholder={c.result === 'fail' ? 'Required: what failed' : 'Optional'}
                  maxLength="1000" value={c.notes} onChange={e => setCheck(i, 'notes', e.target.value)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row g-2 mb-2">
        <div className="col-sm-4">
          <label className="form-label small" htmlFor={id('outcome')}>Overall outcome</label>
          <select id={id('outcome')} className="form-select form-select-sm" value={fields.outcome} onChange={set('outcome')}>
            {Object.entries(INSPECTION_OUTCOMES).map(([k, o]) => (
              <option key={k} value={k} disabled={(k === 'pass' && anyFail) || (k !== 'fail' && electricalFail)}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="col-sm-8">
          <label className="form-label small" htmlFor={id('file')}>Signed report or test printout (optional, PDF/PNG/JPEG, 5 MB)</label>
          <input id={id('file')} type="file" accept=".pdf,.png,.jpg,.jpeg" className="form-control form-control-sm"
            onChange={e => setFile(e.target.files[0] || null)} />
        </div>
      </div>
      <div className="mb-2">
        <label className="form-label small" htmlFor={id('summary')}>Summary for buyers</label>
        <textarea id={id('summary')} className="form-control form-control-sm" rows="3" required maxLength="4000"
          value={fields.summary} onChange={set('summary')} />
      </div>

      {error && <div className="alert alert-danger py-1 small">{error}</div>}
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>{busy ? 'Filing…' : 'File report'}</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>Back</button>
      </div>
      <small className="text-muted d-block mt-2">The report is published on the listing as soon as it is filed and cannot be changed.</small>
    </form>
  );
};

const InspectionCard = ({ inspection, role, onChanged }) => {
  const [mode, setMode] = useState(null); // 'report' | 'decline' | null
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = INSPECTION_STATUSES[inspection.status];
  const product = inspection.product;

  const act = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      await axios.post(`/api/inspections/${inspection._id}/${path}`, body);
      setMode(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = ['requested', 'accepted'].includes(inspection.status);
  const seller = inspection.sellerOrganization;
  const report = inspection.report;

  return (
    <div className="card shadow-sm mb-3">
      <div className="card-body">
        <div className="d-flex gap-3 flex-wrap">
          {product?.imageUrl && (
            <img src={product.imageUrl} alt={product.title} width="88" height="88" className="rounded" style={{ objectFit: 'cover' }} />
          )}
          <div className="flex-grow-1" style={{ minWidth: 220 }}>
            <div className="d-flex justify-content-between flex-wrap gap-2">
              {product ? <Link to={`/products/${product._id}`} className="fw-semibold">{product.title}</Link>
                : <span className="text-muted">Listing removed</span>}
              <span className={`badge align-self-start ${status.className}`}>{status.label}</span>
            </div>
            {product && (
              <div className="small text-muted">
                {product.manufacturer} {product.deviceModel} · Class {product.deviceClass} · {product.location?.city}, {product.location?.province}
              </div>
            )}
            <div className="small text-muted mb-1">
              {role === 'seller'
                ? <>Inspector: {inspection.inspectorOrganization?.name}</>
                : <>Seller: {seller?.name}{seller?.phone && <> · {seller.phone}</>} · {inspection.requestedBy?.name} · <a href={`mailto:${inspection.requestedBy?.email}`}>{inspection.requestedBy?.email}</a></>}
              {' '}· requested {formatTimestamp(inspection.createdAt)}
            </div>
            {inspection.requestNote && <div className="small text-muted">Seller: “{inspection.requestNote}”</div>}
            {inspection.declineNote && <div className="small text-muted">Inspector: “{inspection.declineNote}”</div>}
            {report && (
              <div className="small">
                <span className={`badge ${INSPECTION_OUTCOMES[report.outcome].className}`}>{INSPECTION_OUTCOMES[report.outcome].label}</span>
                {' '}inspected {formatDate(report.inspectedAt)}
                {product && <> · <Link to={`/products/${product._id}#inspection`}>View report</Link></>}
              </div>
            )}

            {error && <div className="alert alert-danger py-1 small mt-2 mb-0">{error}</div>}

            <div className="mt-2 d-flex gap-2 flex-wrap">
              {role === 'seller' && open && (
                <button className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={() => act('cancel')}>Cancel request</button>
              )}
              {role === 'inspector' && inspection.status === 'requested' && mode === null && (
                <button className="btn btn-sm btn-success" disabled={busy} onClick={() => act('accept')}>Accept</button>
              )}
              {role === 'inspector' && inspection.status === 'accepted' && mode === null && product && (
                <button className="btn btn-sm btn-primary" onClick={() => setMode('report')}>File report…</button>
              )}
              {role === 'inspector' && open && mode === null && (
                <button className="btn btn-sm btn-outline-danger" onClick={() => setMode('decline')}>Decline…</button>
              )}
            </div>
            {mode === 'decline' && (
              <div className="d-flex gap-2 flex-wrap align-items-end mt-2">
                <input className="form-control form-control-sm" style={{ maxWidth: 360 }} aria-label="Reason (optional)"
                  placeholder="Reason (optional, shown to the seller)" value={note} onChange={e => setNote(e.target.value)} />
                <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act('decline', { note })}>Decline</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setMode(null)}>Back</button>
              </div>
            )}
          </div>
        </div>
        {mode === 'report' && (
          <ReportForm inspection={inspection} onCancel={() => setMode(null)} onDone={() => { setMode(null); onChanged(); }} />
        )}
      </div>
    </div>
  );
};

const TABS = { requested: 'For My Listings', assigned: 'Assigned to Me (Inspector)' };

const InspectionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'assigned' ? 'assigned' : 'requested';
  const requestFor = searchParams.get('product');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    axios.get(`/api/inspections/${tab}`)
      .then(res => { setItems(res.data); setError(''); })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(load, [load]);

  const closeRequestForm = () => {
    setSearchParams({});
    load();
  };

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h1 className="mb-1">Inspections</h1>
      <p className="text-muted">
        Independent inspections by verified biomedical service providers. Reports are published on the listing.
      </p>
      {requestFor && <RequestForm productId={requestFor} onDone={closeRequestForm} />}
      <ul className="nav nav-tabs mb-4">
        {Object.entries(TABS).map(([key, label]) => (
          <li className="nav-item" key={key}>
            <button className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setSearchParams(key === 'requested' ? {} : { tab: key })}>
              {label}
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? <p>Loading...</p> : !items.length ? (
        <p className="text-muted">
          {tab === 'requested'
            ? <>No inspection requests yet. Request one from <Link to="/my-listings">My Listings</Link>.</>
            : 'No inspection requests assigned to your organization. Only verified biomedical service providers receive them.'}
        </p>
      ) : (
        items.map(i => <InspectionCard key={i._id} inspection={i} role={tab === 'requested' ? 'seller' : 'inspector'} onChanged={load} />)
      )}
    </div>
  );
};

export default InspectionsPage;
