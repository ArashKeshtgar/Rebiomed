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

// Mirrors LISTABLE_DEVICE_CLASSES on the server.
export const LISTABLE_DEVICE_CLASSES = ['I', 'II'];

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

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
