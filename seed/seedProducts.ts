import '../env';

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from '../db';
import Category, { ICategory } from '../models/Category';
import Organization, { IOrganization } from '../models/Organization';
import Product from '../models/Product';
import User from '../models/User';
import { Condition, DeviceClass, OrganizationType, Province, ServiceType } from '../config/medical';

// All organizations, manufacturers and models below are FICTIONAL demo data.

const categoryNames = [
  'Patient Monitoring',
  'Diagnostic Imaging',
  'Dental',
  'Laboratory',
  'Beds & Patient Handling',
  'Rehabilitation & Mobility',
  'Surgical Instruments'
] as const;
type CategoryName = typeof categoryNames[number];

// Real, relevant photos from Unsplash's CDN (free license), one hand-picked per listing.
const img = (id: string): string => `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&q=80`;

interface SeedOrg {
  key: string;
  name: string;
  type: OrganizationType;
  province: Province;
  city: string;
  mdelNumber?: string;
}

const orgs: SeedOrg[] = [
  { key: 'dealer', name: 'Harbourline Medical Equipment (demo)', type: 'dealer', province: 'BC', city: 'Vancouver', mdelNumber: 'DEMO-0001' },
  { key: 'clinic', name: 'Maple Grove Family Clinic (demo)', type: 'clinic', province: 'ON', city: 'Toronto' },
  { key: 'dental', name: 'Prairie Smiles Dental (demo)', type: 'clinic', province: 'AB', city: 'Calgary' },
  { key: 'service', name: 'Northstar Biomedical Services (demo)', type: 'service_provider', province: 'QC', city: 'Montreal' }
];

interface SeedListing {
  org: string;
  title: string;
  description: string;
  price: number;
  category: CategoryName;
  image: string;
  manufacturer: string;
  deviceModel: string;
  yearOfManufacture: number;
  deviceClass: DeviceClass;
  condition: Condition;
  usageHours?: number;
  lastServiceDate?: string;
  lastCalibrationDate?: string;
  serviceHistory?: { date: string; type: ServiceType; performedBy: string }[];
}

const pm = (date: string, performedBy = 'Northstar Biomedical Services (demo)') =>
  ({ date, type: 'preventive_maintenance' as const, performedBy });
const cal = (date: string, performedBy = 'Northstar Biomedical Services (demo)') =>
  ({ date, type: 'calibration' as const, performedBy });

const listings: SeedListing[] = [
  {
    org: 'dealer', title: 'Vital Signs Monitor with SpO2 and NIBP', category: 'Patient Monitoring',
    description: 'Spot-check and continuous monitor: SpO2, non-invasive blood pressure and temperature. Includes adult cuff set and roll stand.',
    price: 1850, image: img('1513224502586-d1e602410265'),
    manufacturer: 'Aurelian Medical', deviceModel: 'VS-300', yearOfManufacture: 2020, deviceClass: 'II',
    condition: 'refurbished', usageHours: 6200, lastServiceDate: '2026-06-12', lastCalibrationDate: '2026-06-12',
    serviceHistory: [pm('2025-06-10'), cal('2026-06-12')]
  },
  {
    org: 'clinic', title: '12" Bedside Patient Monitor', category: 'Patient Monitoring',
    description: '5-lead ECG, SpO2, NIBP and respiration. Wall-mount bracket included. Retired after a clinic upgrade, fully working.',
    price: 2400, image: img('1682706841297-5524ba1faa9c'),
    manufacturer: 'Aurelian Medical', deviceModel: 'BM-12', yearOfManufacture: 2019, deviceClass: 'II',
    condition: 'used_good', usageHours: 14800, lastServiceDate: '2025-11-03', lastCalibrationDate: '2025-11-03',
    serviceHistory: [pm('2024-11-01'), cal('2025-11-03')]
  },
  {
    org: 'dealer', title: 'Portable Ultrasound System with Two Probes', category: 'Diagnostic Imaging',
    description: 'Cart-based ultrasound with convex and linear probes, B/M mode and colour Doppler. Probes inspected, no delamination.',
    price: 14500, image: img('1691935071222-c008a4ccc2ca'),
    manufacturer: 'Kestrel Diagnostics', deviceModel: 'Sonara C5', yearOfManufacture: 2021, deviceClass: 'II',
    condition: 'used_excellent', usageHours: 3100, lastServiceDate: '2026-04-20',
    serviceHistory: [{ date: '2026-04-20', type: 'inspection', performedBy: 'Northstar Biomedical Services (demo)' }]
  },
  {
    org: 'dental', title: 'Dental Treatment Unit with Delivery System', category: 'Dental',
    description: 'Patient chair, over-the-patient delivery, LED operatory light and assistant instrumentation. Upholstery in very good shape.',
    price: 9800, image: img('1629909613654-28e377c37b09'),
    manufacturer: 'Cedarline Dental', deviceModel: 'Operatory 5', yearOfManufacture: 2018, deviceClass: 'I',
    condition: 'used_good', lastServiceDate: '2026-02-14', serviceHistory: [pm('2026-02-14')]
  },
  {
    org: 'dealer', title: 'Refurbished Dental Patient Chair', category: 'Dental',
    description: 'Fully refurbished hydraulic chair, new upholstery, 90-day dealer warranty.',
    price: 5200, image: img('1728342057953-94bfad8f0e7e'),
    manufacturer: 'Cedarline Dental', deviceModel: 'Comfort 300', yearOfManufacture: 2017, deviceClass: 'I',
    condition: 'refurbished', lastServiceDate: '2026-07-01', serviceHistory: [pm('2026-07-01', 'Harbourline Medical Equipment (demo)')]
  },
  {
    org: 'service', title: 'Binocular Laboratory Microscope', category: 'Laboratory',
    description: '4x/10x/40x/100x oil objectives, LED illumination, mechanical stage. Optics cleaned and aligned.',
    price: 950, image: img('1526930382372-67bf22c0fce2'),
    manufacturer: 'Harbour Optics', deviceModel: 'LM-400', yearOfManufacture: 2019, deviceClass: 'I',
    condition: 'used_excellent', lastServiceDate: '2026-05-05', serviceHistory: [pm('2026-05-05')]
  },
  {
    org: 'clinic', title: 'Benchtop Clinical Centrifuge', category: 'Laboratory',
    description: '24-place rotor, up to 4,000 RPM, imbalance detection and lid lock. Speed verified with a tachometer.',
    price: 1100, image: img('1748278739348-d9886621530f'),
    manufacturer: 'Harbour Lab Systems', deviceModel: 'CX-24', yearOfManufacture: 2020, deviceClass: 'I',
    condition: 'used_good', lastCalibrationDate: '2026-03-18', serviceHistory: [cal('2026-03-18')]
  },
  {
    org: 'dealer', title: 'Electric Hospital Bed, 3-Motor', category: 'Beds & Patient Handling',
    description: 'Height, back and knee adjustment, full side rails, pendant control and mattress. Motors and hand control tested.',
    price: 2100, image: img('1628372095387-017d1099fc19'),
    manufacturer: 'Tamarack Care', deviceModel: 'EB-3', yearOfManufacture: 2019, deviceClass: 'II',
    condition: 'refurbished', lastServiceDate: '2026-06-30', serviceHistory: [pm('2026-06-30', 'Harbourline Medical Equipment (demo)')]
  },
  {
    org: 'clinic', title: 'Manual Hospital Bed with Mattress', category: 'Beds & Patient Handling',
    description: 'Two-crank manual bed with locking casters and half rails. Light cosmetic wear.',
    price: 650, image: img('1611587266737-cc128ffe2946'),
    manufacturer: 'Tamarack Care', deviceModel: 'MB-2', yearOfManufacture: 2016, deviceClass: 'I',
    condition: 'used_fair'
  },
  {
    org: 'service', title: 'Lightweight Folding Wheelchair', category: 'Rehabilitation & Mobility',
    description: '18" seat, flip-back arms, swing-away footrests. Tires and brakes checked.',
    price: 280, image: img('1619618691037-751d1e6c9ad1'),
    manufacturer: 'Tamarack Mobility', deviceModel: 'Fold 18', yearOfManufacture: 2022, deviceClass: 'I',
    condition: 'used_excellent'
  },
  {
    org: 'clinic', title: 'Physiotherapy Treatment Table', category: 'Rehabilitation & Mobility',
    description: 'Electric height-adjustable treatment table with face hole and adjustable backrest.',
    price: 1350, image: img('1630226040750-d934f017f0e4'),
    manufacturer: 'Summit Rehab', deviceModel: 'TT-2', yearOfManufacture: 2021, deviceClass: 'I',
    condition: 'used_good'
  },
  {
    org: 'dealer', title: 'General Surgery Instrument Set', category: 'Surgical Instruments',
    description: 'Stainless steel set in a perforated tray: forceps, clamps, scissors, needle holders. Inspected and reprocessed.',
    price: 740, image: img('1688565631957-0306970fdd74'),
    manufacturer: 'Aurelian Surgical', deviceModel: 'GS-40', yearOfManufacture: 2021, deviceClass: 'I',
    condition: 'refurbished',
    serviceHistory: [{ date: '2026-08-02', type: 'inspection', performedBy: 'Harbourline Medical Equipment (demo)' }]
  }
];

const run = async (): Promise<void> => {
  await connectDB();

  await Category.deleteMany({});
  await Product.deleteMany({});
  const seedEmails = orgs.map(o => `demo-${o.key}@rebiomed.example`);
  // Also clear demo accounts created before the rename from Voltra.
  const legacyEmails = [...orgs.map(o => `demo-${o.key}@voltra.store`), 'demo-seller@voltra.store'];
  const oldSeedUsers = await User.find({ email: { $in: [...seedEmails, ...legacyEmails] } });
  await Organization.deleteMany({ owner: { $in: oldSeedUsers.map(u => u._id) } });
  await User.deleteMany({ _id: { $in: oldSeedUsers.map(u => u._id) } });

  const categoryDocs: Record<string, ICategory> = {};
  for (const name of categoryNames) {
    categoryDocs[name] = await Category.create({ name });
  }

  const orgDocs: Record<string, { org: IOrganization; userId: mongoose.Types.ObjectId }> = {};
  const password = await bcrypt.hash('seed-account-not-for-login', 10);
  for (const o of orgs) {
    const user = await User.create({ name: o.name, email: `demo-${o.key}@rebiomed.example`, password });
    const org = await Organization.create({
      name: o.name, type: o.type, province: o.province, city: o.city, mdelNumber: o.mdelNumber, owner: user._id
    });
    user.organization = org._id as mongoose.Types.ObjectId;
    await user.save();
    orgDocs[o.key] = { org, userId: user._id as mongoose.Types.ObjectId };
  }

  for (const l of listings) {
    const { org, userId } = orgDocs[l.org];
    await Product.create({
      title: l.title,
      description: l.description,
      price: l.price,
      category: categoryDocs[l.category]._id,
      imageUrl: l.image,
      stock: 1,
      seller: userId,
      organization: org._id,
      manufacturer: l.manufacturer,
      deviceModel: l.deviceModel,
      yearOfManufacture: l.yearOfManufacture,
      deviceClass: l.deviceClass,
      condition: l.condition,
      usageHours: l.usageHours,
      lastServiceDate: l.lastServiceDate,
      lastCalibrationDate: l.lastCalibrationDate,
      serviceHistory: l.serviceHistory ?? [],
      location: { province: org.province, city: org.city }
    });
  }

  console.log(`Seeded ${categoryNames.length} categories, ${orgs.length} organizations and ${listings.length} listings (all fictional demo data).`);
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
