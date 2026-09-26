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

// Class III and IV devices carry the heaviest regulatory obligations, so the
// marketplace does not accept them until seller verification is in place.
export const LISTABLE_DEVICE_CLASSES: readonly DeviceClass[] = ['I', 'II'];

export const CONDITIONS = [
  'new', 'refurbished', 'used_excellent', 'used_good', 'used_fair', 'for_parts'
] as const;
export type Condition = typeof CONDITIONS[number];

export const SERVICE_TYPES = ['preventive_maintenance', 'repair', 'calibration', 'inspection'] as const;
export type ServiceType = typeof SERVICE_TYPES[number];
