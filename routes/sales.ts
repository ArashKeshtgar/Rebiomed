import express, { Request, Response } from 'express';
import Order from '../models/Order';
import User from '../models/User';
import auth from '../middleware/auth';
import { FulfillmentError, cancelBySeller, markShipped } from '../services/fulfillment';

// The seller's side of orders: what they sold, to whom, and shipping.
const router = express.Router();

router.use(auth);

const myOrganizationId = async (userId: string): Promise<string | null> => {
  const user = await User.findById(userId).select('organization');
  return user?.organization ? user.organization.toString() : null;
};

const sendError = (res: Response, err: unknown) => {
  if (err instanceof FulfillmentError) return res.status(err.status).json({ msg: err.message });
  console.error((err as Error).message);
  return res.status(500).send('Server error');
};

// @route   GET /api/sales
// @desc    This organization's part of every paid order, with the buyer's contact
//          details so freight can be arranged
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = await myOrganizationId(req.user!.id);
    if (!orgId) return res.status(404).json({ msg: 'Create your organization first' });

    const orders = await Order.find({ 'fulfillments.organization': orgId, status: { $in: ['paid', 'refunded'] } })
      .populate('user', 'name email')
      .sort('-createdAt');

    res.json(orders.map(o => ({
      orderId: o.id,
      createdAt: o.createdAt,
      buyer: o.user,
      items: o.items.filter(i => i.organization.toString() === orgId),
      fulfillment: o.fulfillments.find(f => f.organization.toString() === orgId)
    })));
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/sales/:orderId/fulfillments/:fid/ship   { carrier?, trackingNumber? }
router.post('/:orderId/fulfillments/:fid/ship', async (req: Request, res: Response) => {
  try {
    const orgId = await myOrganizationId(req.user!.id);
    if (!orgId) return res.status(404).json({ msg: 'Order not found' });
    await markShipped(req.params.orderId, req.params.fid, orgId, req.body);
    res.json({ msg: 'Marked as shipped' });
  } catch (err) {
    sendError(res, err);
  }
});

// @route   POST /api/sales/:orderId/fulfillments/:fid/cancel   { reason }
// @desc    Cancel before shipping: refunds the buyer for this seller's items and restocks them
router.post('/:orderId/fulfillments/:fid/cancel', async (req: Request, res: Response) => {
  try {
    const orgId = await myOrganizationId(req.user!.id);
    if (!orgId) return res.status(404).json({ msg: 'Order not found' });
    await cancelBySeller(req.params.orderId, req.params.fid, orgId, req.body.reason);
    res.json({ msg: 'Cancelled and refunded' });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
