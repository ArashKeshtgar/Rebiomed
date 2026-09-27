// Domain constants for the Canadian medical-equipment marketplace.

export const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
] as const;
export type Province = typeof PROVINCES[number];

export const ORGANIZATION_TYPES = ['clinic', 'hospital', 'dealer', 'service_provider'] as const;
export type OrganizationType = typeof ORGANIZATION_TYPES[number];

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = typeof VERIFICATION_STATUSES[number];

// Health Canada risk classes under the Medical Devices Regulations (I = lowest, IV = highest).
export const DEVICE_CLASSES = ['I', 'II', 'III', 'IV'] as const;
export type DeviceClass = typeof DEVICE_CLASSES[number];

// Which device classes an organization may list, by verification status.
// Class III needs a seller an admin has verified; Class IV (highest risk,
// e.g. implantables and life support) is not accepted at all yet.
export const OPEN_DEVICE_CLASSES: readonly DeviceClass[] = ['I', 'II'];
export const VERIFIED_DEVICE_CLASSES: readonly DeviceClass[] = ['I', 'II', 'III'];

export const listableDeviceClasses = (status: VerificationStatus): readonly DeviceClass[] =>
  status === 'verified' ? VERIFIED_DEVICE_CLASSES : OPEN_DEVICE_CLASSES;

// Classes that are only listed because the seller is verified; these listings
// are suspended if the organization loses its verification.
export const VERIFICATION_GATED_CLASSES: readonly DeviceClass[] =
  VERIFIED_DEVICE_CLASSES.filter(c => !OPEN_DEVICE_CLASSES.includes(c));

export const DOCUMENT_KINDS = [
  'mdel_licence', 'business_registration', 'professional_licence', 'other'
] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];

export const MAX_DOCUMENTS = 10;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const CONDITIONS = [
  'new', 'refurbished', 'used_excellent', 'used_good', 'used_fair', 'for_parts'
] as const;
export type Condition = typeof CONDITIONS[number];

export const SERVICE_TYPES = ['preventive_maintenance', 'repair', 'calibration', 'inspection'] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

// Offers: a buyer proposes a lower price, the seller accepts, declines or
// counters. Unanswered offers lapse; an accepted price is held only briefly
// so it can't be sat on while the equipment sells to someone else.
export const OFFER_RESPONSE_DAYS = 7;
export const ACCEPTED_OFFER_HOURS = 72;
