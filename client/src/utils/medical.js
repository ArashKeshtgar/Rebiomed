// Labels for the medical-equipment domain. Keys mirror config/medical.ts on the server.

export const PROVINCES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon'
};

export const ORGANIZATION_TYPES = {
  clinic: 'Clinic',
  hospital: 'Hospital',
  dealer: 'Equipment dealer',
  service_provider: 'Biomedical service provider'
};

export const DEVICE_CLASSES = {
  I: 'Class I (lowest risk)',
  II: 'Class II',
  III: 'Class III',
  IV: 'Class IV (highest risk)'
};

// Mirrors listableDeviceClasses() on the server: Class III needs a verified
// seller, Class IV is not accepted yet.
export const listableDeviceClasses = (verificationStatus) =>
  verificationStatus === 'verified' ? ['I', 'II', 'III'] : ['I', 'II'];

export const DOCUMENT_KINDS = {
  mdel_licence: 'Health Canada MDEL licence',
  business_registration: 'Business registration',
  professional_licence: 'Professional / clinic licence',
  other: 'Other supporting document'
};

export const CONDITIONS = {
  new: 'New',
  refurbished: 'Refurbished',
  used_excellent: 'Used, excellent',
  used_good: 'Used, good',
  used_fair: 'Used, fair',
  for_parts: 'For parts / not working'
};

export const SERVICE_TYPES = {
  preventive_maintenance: 'Preventive maintenance',
  repair: 'Repair',
  calibration: 'Calibration',
  inspection: 'Inspection'
};

export const VERIFICATION_BADGES = {
  verified: { label: 'Verified seller', className: 'bg-success' },
  pending: { label: 'Verification pending', className: 'bg-warning text-dark' },
  unverified: { label: 'Unverified seller', className: 'bg-secondary' },
  rejected: { label: 'Not verified', className: 'bg-danger' }
};

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

// "CA$1,850.00" — explicit about the currency since sellers and buyers are in Canada.
export const formatPrice = (amount) => `CA${cad.format(amount)}`;

// For moments in time (uploads, reviews): shown in the viewer's own time zone.
export const formatTimestamp = (value) =>
  value ? new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// For calendar dates entered without a time (service, calibration): stored as
// UTC midnight, so format in UTC or they can show up a day early.
export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';

export const FULFILLMENT_STATUSES = {
  awaiting_payment: { label: 'Awaiting payment', className: 'bg-secondary' },
  awaiting_shipment: { label: 'Awaiting shipment', className: 'bg-info text-dark' },
  shipped: { label: 'Shipped', className: 'bg-primary' },
  delivered: { label: 'Delivered', className: 'bg-success' },
  disputed: { label: 'Problem reported', className: 'bg-warning text-dark' },
  cancelled: { label: 'Cancelled by seller', className: 'bg-secondary' },
  refunded: { label: 'Refunded', className: 'bg-secondary' }
};

export const PAYOUT_STATUSES = {
  not_due: 'Held until the buyer confirms delivery',
  pending: 'Due — waiting for your payout setup',
  processing: 'Sending…',
  paid: 'Paid out',
  failed: 'Payout failed — will retry'
};

export const formatCents = (cents) => formatPrice(cents / 100);

export const OFFER_STATUSES = {
  pending: { label: 'Waiting for seller', className: 'bg-info text-dark' },
  countered: { label: 'Counter-offer', className: 'bg-warning text-dark' },
  accepted: { label: 'Accepted', className: 'bg-success' },
  used: { label: 'Purchased', className: 'bg-secondary' },
  declined: { label: 'Declined', className: 'bg-secondary' },
  withdrawn: { label: 'Withdrawn', className: 'bg-secondary' },
  expired: { label: 'Expired', className: 'bg-secondary' }
};

// Independent inspections. Keys mirror INSPECTION_CHECKS etc. on the server.
export const INSPECTION_CHECKS = {
  visual_physical: { label: 'Visual & physical', hint: 'Housing, cables, connectors, labels, cleanliness' },
  electrical_safety: { label: 'Electrical safety', hint: 'Leakage current and earth resistance (IEC 62353 / CSA C22.2 No. 60601-1)' },
  functional_performance: { label: 'Functional performance', hint: "Operates to the manufacturer's specifications" },
  calibration_accuracy: { label: 'Calibration / accuracy', hint: 'Readings checked against a reference' },
  alarms: { label: 'Alarms & self-tests', hint: 'Audible and visual alarms, power-on self-test' },
  accessories_documentation: { label: 'Accessories & documentation', hint: 'Probes, cuffs, cables, manuals, service records' }
};

export const CHECK_RESULTS = {
  pass: { label: 'Pass', className: 'text-success' },
  fail: { label: 'Fail', className: 'text-danger fw-semibold' },
  not_applicable: { label: 'N/A', className: 'text-muted' }
};

export const INSPECTION_OUTCOMES = {
  pass: { label: 'Passed inspection', className: 'bg-success' },
  pass_with_findings: { label: 'Passed with findings', className: 'bg-warning text-dark' },
  fail: { label: 'Failed inspection', className: 'bg-danger' }
};

export const INSPECTION_STATUSES = {
  requested: { label: 'Waiting for inspector', className: 'bg-info text-dark' },
  accepted: { label: 'Inspection scheduled', className: 'bg-primary' },
  completed: { label: 'Report filed', className: 'bg-success' },
  declined: { label: 'Declined', className: 'bg-secondary' },
  cancelled: { label: 'Cancelled', className: 'bg-secondary' }
};

// A listing's inspection summary counts only while it is still current.
export const currentInspection = (product) =>
  product && product.inspection && new Date(product.inspection.validUntil) > new Date() ? product.inspection : null;

export const formatDeadline = (value) =>
  value ? new Date(value).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
