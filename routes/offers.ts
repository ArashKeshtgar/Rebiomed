import express, { Request, Response } from 'express';
import Offer from '../models/Offer';
import auth from '../middleware/auth';
import {
  OfferError,
  acceptCounter,
  acceptOffer,
  counterOffer,
  declineOffer,
  expireStale,
  makeOffer,
  organizationOf,
  withdrawOffer
} from '../services/offers';

const router = express.Router();

router.use(auth);

const PRODUCT_FIELDS = 'title imageUrl price stock deviceClass condition';

const sendError = (res: Response, err: unknown) => {
  if (err instanceof OfferError) return res.status(err.status).json({ msg: err.message });
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

// Runs a seller action with the caller's organization, or 404s if they have none.
const asSeller = (action: (offerId: string, orgId: string, req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      const orgId = await organizationOf(req.user!.id);
      if (!orgId) return res.status(404).json({ msg: 'Offer not found' });
      res.json(await action(req.params.id, orgId, req));
    } catch (err) {
      sendError(res, err);
    }
  };

const asBuyer = (action: (offerId: string, buyerId: string) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json(await action(req.params.id, req.user!.id));
    } catch (err) {
      sendError(res, err);
    }
  };

// @route   POST /api/offers   { productId, amount, message? }
// @desc    Offer a price below the listing's
router.post('/', async (req: Request, res: Response) => {
  try {
    res.json(await makeOffer(req.user!.id, req.body.productId, req.body.amount, req.body.message));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/offers/mine[?product=<id>]
// @desc    Offers the logged-in user made, newest first
router.get('/mine', async (req: Request, res: Response) => {
  try {
    await expireStale();
    const filter: Record<string, unknown> = { buyer: req.user!.id };
    if (typeof req.query.product === 'string') filter.product = req.query.product;
    const offers = await Offer.find(filter)
      .populate('product', PRODUCT_FIELDS)
      .populate('organization', 'name')
      .sort('-createdAt');
    res.json(offers);
  } catch (err) {
    sendError(res, err);
  }
});

// @route   GET /api/offers/received
// @desc    Offers on the logged-in user's organization's listings, with the buyer's contact
router.get('/received', async (req: Request, res: Response) => {
  try {
    const orgId = await organizationOf(req.user!.id);
    if (!orgId) return res.json([]);
    await expireStale();
    const offers = await Offer.find({ organization: orgId })
      .populate('product', PRODUCT_FIELDS)
      .populate('buyer', 'name email')
      .sort('-createdAt');
    res.json(offers);
  } catch (err) {
    sendError(res, err);
  }
});

// Seller
router.post('/:id/accept', asSeller((id, org) => acceptOffer(id, org)));
router.post('/:id/decline', asSeller((id, org, req) => declineOffer(id, org, req.body.note)));
router.post('/:id/counter', asSeller((id, org, req) => counterOffer(id, org, req.body.amount, req.body.note)));

// Buyer
router.post('/:id/accept-counter', asBuyer(acceptCounter));
router.post('/:id/withdraw', asBuyer(withdrawOffer));

export default router;
