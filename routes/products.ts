import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { check, validationResult } from 'express-validator';
import Product, { IServiceRecord } from '../models/Product';
import Organization from '../models/Organization';
import User from '../models/User';
import auth from '../middleware/auth';
import {
  CONDITIONS,
  DEVICE_CLASSES,
  LISTABLE_DEVICE_CLASSES,
  PROVINCES,
  SERVICE_TYPES
} from '../config/medical';

const router = express.Router();
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

const ORG_PUBLIC_FIELDS = 'name type province city verificationStatus';
const MAX_SERVICE_RECORDS = 50;

// Parses the serviceHistory field, which arrives as a JSON string in multipart
// form posts. Throws with a user-facing message on bad input.
const parseServiceHistory = (raw: unknown): IServiceRecord[] => {
  if (raw === undefined || raw === '') return [];
  const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(list)) throw new Error('Service history must be a list');
  if (list.length > MAX_SERVICE_RECORDS) throw new Error(`At most ${MAX_SERVICE_RECORDS} service records`);
  return list.map((r, i) => {
    const date = new Date(r?.date);
    if (Number.isNaN(date.getTime())) throw new Error(`Service record ${i + 1}: invalid date`);
    if (date.getTime() > Date.now()) throw new Error(`Service record ${i + 1}: date is in the future`);
    if (!SERVICE_TYPES.includes(r?.type)) throw new Error(`Service record ${i + 1}: invalid type`);
    const performedBy = String(r?.performedBy ?? '').trim();
    if (!performedBy) throw new Error(`Service record ${i + 1}: "performed by" is required`);
    const notes = r?.notes ? String(r.notes).trim() : undefined;
    return { date, type: r.type, performedBy, notes };
  });
};

const currentYear = new Date().getFullYear();

const listingValidators = [
  check('title', 'Title is required').trim().notEmpty(),
  check('description', 'Description is required').trim().notEmpty(),
  check('price', 'Price must be greater than 0').isFloat({ gt: 0 }),
  check('stock', 'Quantity must be a whole number').optional({ values: 'falsy' }).isInt({ min: 0 }),
  check('category', 'Category is required').isMongoId(),
  check('manufacturer', 'Manufacturer is required').trim().notEmpty(),
  check('deviceModel', 'Model is required').trim().notEmpty(),
  check('yearOfManufacture', `Year must be between 1950 and ${currentYear}`)
    .optional({ values: 'falsy' }).isInt({ min: 1950, max: currentYear }),
  check('deviceClass', 'Device class must be I, II, III or IV').isIn(DEVICE_CLASSES).bail()
    .isIn(LISTABLE_DEVICE_CLASSES)
    .withMessage('Class III and IV devices cannot be listed yet; they need seller verification first'),
  check('condition', 'Condition is required').isIn(CONDITIONS),
  check('usageHours', 'Usage hours must be a whole number').optional({ values: 'falsy' }).isInt({ min: 0 }),
  check('lastServiceDate', 'Last service date is invalid').optional({ values: 'falsy' }).isISO8601(),
  check('lastCalibrationDate', 'Last calibration date is invalid').optional({ values: 'falsy' }).isISO8601(),
  check('province', 'Province must be a Canadian province/territory code').optional({ values: 'falsy' }).isIn(PROVINCES)
];

// @route   GET /api/products
// @desc    Browse listings. Optional filters: category, deviceClass, condition, province
// @access  Public
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    const { category, deviceClass, condition, province } = req.query;
    if (typeof category === 'string' && category) filter.category = category;
    if (typeof deviceClass === 'string' && (DEVICE_CLASSES as readonly string[]).includes(deviceClass)) {
      filter.deviceClass = deviceClass;
    }
    if (typeof condition === 'string' && (CONDITIONS as readonly string[]).includes(condition)) {
      filter.condition = condition;
    }
    if (typeof province === 'string' && (PROVINCES as readonly string[]).includes(province)) {
      filter['location.province'] = province;
    }

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('organization', ORG_PUBLIC_FIELDS)
      .sort('-createdAt');
    res.json(products);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/products/mine
// @desc    List the logged-in user's own listings
// @access  Private
router.get('/mine', auth, async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ seller: req.user!.id })
      .populate('category', 'name')
      .sort('-createdAt');
    res.json(products);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   GET /api/products/:id
// @access  Public
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('organization', ORG_PUBLIC_FIELDS);
    if (!product) return res.status(404).json({ msg: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/products
// @desc    List a piece of equipment for sale on behalf of the user's organization
// @access  Private (user must have an organization)
router.post('/', auth, upload.single('image'), listingValidators, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = await User.findById(req.user!.id);
    const org = user?.organization ? await Organization.findById(user.organization) : null;
    if (!org) {
      return res.status(403).json({
        errors: [{ msg: 'Create your organization profile before listing equipment' }]
      });
    }

    let serviceHistory: IServiceRecord[];
    try {
      serviceHistory = parseServiceHistory(req.body.serviceHistory);
    } catch (err) {
      return res.status(400).json({ errors: [{ msg: (err as Error).message }] });
    }

    const b = req.body;
    const product = await Product.create({
      title: b.title,
      description: b.description,
      price: b.price,
      category: b.category,
      stock: b.stock || 1,
      imageUrl: req.file ? `/uploads/${req.file.filename}` : b.imageUrl,
      seller: user!._id,
      organization: org._id,
      manufacturer: b.manufacturer,
      deviceModel: b.deviceModel,
      yearOfManufacture: b.yearOfManufacture || undefined,
      deviceClass: b.deviceClass,
      mdlNumber: b.mdlNumber || undefined,
      condition: b.condition,
      usageHours: b.usageHours || undefined,
      lastServiceDate: b.lastServiceDate || undefined,
      lastCalibrationDate: b.lastCalibrationDate || undefined,
      serviceHistory,
      location: {
        province: b.province || org.province,
        city: (b.city || '').trim() || org.city
      }
    });

    res.json(product);
  } catch (err) {
    if ((err as Error).name === 'ValidationError') {
      return res.status(400).json({ errors: [{ msg: (err as Error).message }] });
    }
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

// @route   DELETE /api/products/:id
// @desc    Remove one of your own listings
// @access  Private
router.delete('/:id', auth, async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ msg: 'Product not found' });
    if (product.seller.toString() !== req.user!.id) {
      return res.status(403).json({ msg: 'Not authorized to remove this listing' });
    }
    await product.deleteOne();
    res.json({ msg: 'Listing removed' });
  } catch (err) {
    console.error((err as Error).message);
    res.status(500).send('Server error');
  }
});

export default router;
