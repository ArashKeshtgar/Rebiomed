import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  CHECK_RESULTS,
  INSPECTION_CHECKS,
  INSPECTION_OUTCOMES,
  ORGANIZATION_TYPES,
  PROVINCES,
  formatDate
} from '../../utils/medical';

const Report = ({ inspection, latest }) => {
  const { report } = inspection;
  const outcome = INSPECTION_OUTCOMES[report.outcome];
  const inspector = inspection.inspectorOrganization || {};
  // Matches INSPECTION_VALID_DAYS on the server.
  const expired = new Date(report.inspectedAt).getTime() + 365 * 86400000 < Date.now();

  return (
    <div className={latest ? '' : 'border-top pt-3 mt-3'}>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <span className={`badge ${outcome.className} me-2`}>{outcome.label}</span>
          <span className="text-muted small">
            Inspected {formatDate(report.inspectedAt)}
            {expired && ' · older than 12 months'}
          </span>
        </div>
        {report.attachment && (
          <a className="btn btn-sm btn-outline-secondary" href={`/api/inspections/${inspection._id}/attachment`}>
            Signed report ({report.attachment.originalName})
          </a>
        )}
      </div>

      <p className="mb-2">{report.summary}</p>

      <table className="table table-sm mb-2">
        <tbody>
          {report.checks.map(c => (
            <tr key={c.item}>
              <th scope="row" className="text-muted fw-normal" style={{ width: '45%' }}>{INSPECTION_CHECKS[c.item]?.label || c.item}</th>
              <td>
                <span className={CHECK_RESULTS[c.result].className}>{CHECK_RESULTS[c.result].label}</span>
                {c.notes && <div className="text-muted small">{c.notes}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="small text-muted">
        By <strong className="text-body">{inspector.name}</strong>
        {inspector.type && <> ({ORGANIZATION_TYPES[inspector.type]}, {inspector.city}, {PROVINCES[inspector.province]})</>}
        {' '}· technician {report.technicianName}, {report.credential} · serial no. {report.serialNumber}
      </div>
    </div>
  );
};

// Independent inspection reports for a listing, newest first.
const InspectionReport = ({ productId }) => {
  const [reports, setReports] = useState(null);
  const [showOlder, setShowOlder] = useState(false);

  useEffect(() => {
    axios.get(`/api/inspections/product/${productId}`)
      .then(res => setReports(res.data))
      .catch(() => setReports([]));
  }, [productId]);

  if (reports === null) return null;

  const [latest, ...older] = reports;
  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <h3 className="h5 mb-3">Independent inspection</h3>
        {!latest ? (
          <p className="text-muted mb-0">
            This listing has not been independently inspected. Ask the seller to request an inspection
            from a verified biomedical service provider.
          </p>
        ) : (
          <>
            <Report inspection={latest} latest />
            {older.length > 0 && (
              <button className="btn btn-link btn-sm px-0 mt-2" onClick={() => setShowOlder(s => !s)}>
                {showOlder ? 'Hide' : 'Show'} {older.length} earlier report{older.length > 1 ? 's' : ''}
              </button>
            )}
            {showOlder && older.map(i => <Report key={i._id} inspection={i} />)}
            <p className="text-muted small mt-3 mb-0">
              Performed by a biomedical service provider verified by ReBiomed and independent of the seller.
              The seller chose the inspector but cannot edit or hide the report.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default InspectionReport;
