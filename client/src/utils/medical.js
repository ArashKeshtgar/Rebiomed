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
