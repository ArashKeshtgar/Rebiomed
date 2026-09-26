import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  CONDITIONS,
  Condition,
  DEVICE_CLASSES,
  DeviceClass,
  PROVINCES,
  Province,
  SERVICE_TYPES,
  ServiceType
} from '../config/medical';

export interface IServiceRecord {
  date: Date;
  type: ServiceType;
  performedBy: string;
  notes?: string;
}

// A listing for one piece of medical equipment.
export interface IProduct extends Document {
  title: string;
  description: string;
  price: number;
  category: Types.ObjectId;
  imageUrl: string;
  stock: number;
  seller: Types.ObjectId;
  organization: Types.ObjectId;

  manufacturer: string;
  deviceModel: string;
  yearOfManufacture?: number;
  deviceClass: DeviceClass;
  // Health Canada Medical Device Licence number (required in Canada for Class II-IV devices).
  mdlNumber?: string;
  condition: Condition;
  usageHours?: number;
  lastServiceDate?: Date;
  lastCalibrationDate?: Date;
  serviceHistory: IServiceRecord[];
  location: { province: Province; city: string };

  createdAt: Date;
}

const ServiceRecordSchema = new Schema<IServiceRecord>({
  date: { type: Date, required: true },
  type: { type: String, enum: SERVICE_TYPES, required: true },
  performedBy: { type: String, required: true, trim: true },
  notes: { type: String, trim: true }
}, { _id: false });

const ProductSchema = new Schema<IProduct>({
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0.01 },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  imageUrl: { type: String, required: true },
  stock: { type: Number, default: 1, min: 0 },
  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

  manufacturer: { type: String, required: true, trim: true },
  deviceModel: { type: String, required: true, trim: true },
  yearOfManufacture: { type: Number },
  deviceClass: { type: String, enum: DEVICE_CLASSES, required: true },
  mdlNumber: { type: String, trim: true },
  condition: { type: String, enum: CONDITIONS, required: true },
  usageHours: { type: Number, min: 0 },
  lastServiceDate: { type: Date },
  lastCalibrationDate: { type: Date },
  serviceHistory: { type: [ServiceRecordSchema], default: [] },
  location: {
    province: { type: String, enum: PROVINCES, required: true },
    city: { type: String, required: true, trim: true }
  },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IProduct>('Product', ProductSchema);
