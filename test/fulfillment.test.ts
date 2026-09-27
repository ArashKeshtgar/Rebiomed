import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { Types } from 'mongoose';
import app from '../app';
import stripe from '../services/stripe';
import { stripeOps } from '../services/stripeOps';
import { createPendingOrder, finalizeOrder, priceCart } from '../services/checkout';
import { releasePendingPayouts } from '../services/fulfillment';
import User from '../models/User';
import Organization from '../models/Organization';
import Product from '../models/Product';
import Order from '../models/Order';

chai.use(chaiHttp);

const bearer = (t: string) => `Bearer ${t}`;

const register = async (email: string) => {
  const res = await chai.request(app).post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: 'password123' });
  return res.body.token as string;
};

const createOrg = async (token: string, name: string) => {
  const res = await chai.request(app).post('/api/organizations').set('Authorization', bearer(token))
    .send({ name, type: 'dealer', province: 'ON', city: 'Toronto' });
  return res.body._id as string;
};

const makeProduct = (organization: string, price: number, stock = 3) => Product.create({
  title: `Item ${price}`, description: 'x', price, stock, imageUrl: 'x.png',
  category: new Types.ObjectId(), seller: new Types.ObjectId(), organization,
  manufacturer: 'M', deviceModel: 'D', deviceClass: 'II', condition: 'used_good',
  location: { province: 'ON', city: 'Toronto' }
});

describe('Escrow fulfillment and payouts', () => {
  let buyer: string, sellerA: string, sellerB: string, adminToken: string;
  let orgA: string, orgB: string;
  let calls: { refund: Array<[string, number | undefined, string]>; transfer: Array<[Record<string, unknown>, string]> };
  let failTransfer: boolean, failRefund: boolean;
  const original = { ...stripeOps };

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Organization.deleteMany({}), Product.deleteMany({}), Order.deleteMany({})]);
    buyer = await register('buyer@test.ca');
    sellerA = await register('a@test.ca');
    sellerB = await register('b@test.ca');
    adminToken = await register('admin@test.ca');
    await User.updateOne({ email: 'admin@test.ca' }, { isAdmin: true });
    orgA = await createOrg(sellerA, 'Seller A');
    orgB = await createOrg(sellerB, 'Seller B');

    calls = { refund: [], transfer: [] };
    failTransfer = false;
    failRefund = false;
    stripeOps.refund = async (pi, amount, key) => {
      if (failRefund) throw new Error('card network down');
      calls.refund.push([pi, amount, key]);
      return { id: `re_${calls.refund.length}` };
    };
    stripeOps.transfer = async (p, key) => {
      if (failTransfer) throw new Error('insufficient platform balance');
      calls.transfer.push([p, key]);
      return { id: `tr_${calls.transfer.length}` };
    };
  });

  afterEach(() => { Object.assign(stripeOps, original); });

  // A paid order with one item from each seller: A $1,000, B $250.
  const paidOrder = async () => {
    const a = await makeProduct(orgA, 1000);
    const b = await makeProduct(orgB, 250);
    const buyerId = (await User.findOne({ email: 'buyer@test.ca' }))!.id;
    const cart = await priceCart([{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }]);
    const order = await createPendingOrder(buyerId, cart);
    order.stripePaymentIntentId = `pi_${order.id}`;
    await order.save();
    const paid = await finalizeOrder(order.id, {
      id: order.stripePaymentIntentId, status: 'succeeded', amount: order.totalCents, currency: 'cad', latest_charge: 'ch_123'
    }, async () => {});
    const fid = (org: string) => paid.fulfillments.find(f => f.organization.toString() === org)!._id.toString();
    return { order: paid, a, b, fA: fid(orgA), fB: fid(orgB) };
  };

  const ship = (token: string, orderId: string, fid: string) => chai.request(app)
    .post(`/api/sales/${orderId}/fulfillments/${fid}/ship`).set('Authorization', bearer(token))
    .send({ carrier: 'Purolator', trackingNumber: 'PUR123' });
  const confirm = (token: string, orderId: string, fid: string) => chai.request(app)
    .post(`/api/orders/${orderId}/fulfillments/${fid}/confirm-delivery`).set('Authorization', bearer(token));
  const onboard = (orgId: string) => Organization.updateOne(
    { _id: orgId }, { stripeAccountId: `acct_${orgId}`, stripeDetailsSubmitted: true, payoutsEnabled: true });
  const fulfillment = async (orderId: string, fid: string) => (await Order.findById(orderId))!.fulfillments.id(fid)!;

  it('splits a multi-seller order and keeps the platform fee from each share', async () => {
    const { order, fA, fB } = await paidOrder();
    expect(order.stripeChargeId).to.equal('ch_123');
    const a = order.fulfillments.id(fA)!;
    const b = order.fulfillments.id(fB)!;
    expect([a.status, b.status]).to.deep.equal(['awaiting_shipment', 'awaiting_shipment']);
    expect([a.subtotalCents, a.platformFeeCents, a.payout.amountCents]).to.deep.equal([100000, 8000, 92000]);
    expect([b.subtotalCents, b.platformFeeCents, b.payout.amountCents]).to.deep.equal([25000, 2000, 23000]);
  });

  it('lets only the owning seller ship its part', async () => {
    const { order, fA } = await paidOrder();
    expect(await ship(sellerB, order.id, fA)).to.have.status(404);
    expect(await ship(buyer, order.id, fA)).to.have.status(404);
    expect(await ship(sellerA, order.id, fA)).to.have.status(200);
    const f = await fulfillment(order.id, fA);
    expect([f.status, f.carrier, f.trackingNumber]).to.deep.equal(['shipped', 'Purolator', 'PUR123']);
    expect(await ship(sellerA, order.id, fA)).to.have.status(409);
  });

  it('shows sellers only their own part, with the buyer contact for freight', async () => {
    const { order } = await paidOrder();
    const sales = await chai.request(app).get('/api/sales').set('Authorization', bearer(sellerB));
    expect(sales.body).to.have.length(1);
    expect(sales.body[0].orderId).to.equal(order.id);
    expect(sales.body[0].items.map((i: { title: string }) => i.title)).to.deep.equal(['Item 250']);
    expect(sales.body[0].buyer.email).to.equal('buyer@test.ca');
  });

  it('holds the money until the buyer confirms delivery', async () => {
    const { order, fA } = await paidOrder();
    await onboard(orgA);
    expect(await confirm(buyer, order.id, fA)).to.have.status(409); // not shipped yet
    await ship(sellerA, order.id, fA);
    expect(calls.transfer).to.have.length(0);

    expect(await confirm(sellerA, order.id, fA)).to.have.status(404); // only the buyer confirms
    const res = await confirm(buyer, order.id, fA);
    expect(res).to.have.status(200);

    expect(calls.transfer).to.have.length(1);
    const [params, key] = calls.transfer[0];
    expect(params).to.include({ amountCents: 92000, destination: `acct_${orgA}`, sourceTransaction: 'ch_123', transferGroup: `order_${order.id}` });
    expect(key).to.equal(`payout_${fA}`);
    const f = await fulfillment(order.id, fA);
    expect([f.status, f.payout.status, f.payout.transferId]).to.deep.equal(['delivered', 'paid', 'tr_1']);
  });

  it('never shows the buyer the seller payout or platform fee', async () => {
    const { order, fA } = await paidOrder();
    await ship(sellerA, order.id, fA);
    const res = await confirm(buyer, order.id, fA);
    const f = res.body.fulfillments.find((x: { _id: string }) => x._id === fA);
    expect(f).to.not.have.property('payout');
    expect(f).to.not.have.property('platformFeeCents');
    expect(f.organization.name).to.equal('Seller A');
  });

  it('pays out exactly once when delivery is confirmed twice at the same time', async () => {
    const { order, fA } = await paidOrder();
    await onboard(orgA);
    await ship(sellerA, order.id, fA);
    await Promise.all([confirm(buyer, order.id, fA), confirm(buyer, order.id, fA)]);
    expect(calls.transfer).to.have.length(1);
  });

  it('keeps the payout pending until the seller finishes Stripe onboarding, then releases it', async () => {
    const { order, fA } = await paidOrder();
    await ship(sellerA, order.id, fA);
    await confirm(buyer, order.id, fA);
    let f = await fulfillment(order.id, fA);
    expect(f.payout.status).to.equal('pending');
    expect(calls.transfer).to.have.length(0);

    stripeOps.retrieveAccount = async id => ({ id, detailsSubmitted: true, payoutsEnabled: true });
    await Organization.updateOne({ _id: orgA }, { stripeAccountId: 'acct_new' });
    const refresh = await chai.request(app).post('/api/payouts/refresh').set('Authorization', bearer(sellerA));
    expect(refresh.body).to.deep.equal({ connected: true, detailsSubmitted: true, payoutsEnabled: true });

    f = await fulfillment(order.id, fA);
    expect(f.payout.status).to.equal('paid');
    expect(calls.transfer[0][0].destination).to.equal('acct_new');
  });

  it('marks a refused transfer as failed and retries it later', async () => {
    const { order, fA } = await paidOrder();
    await onboard(orgA);
    await ship(sellerA, order.id, fA);
    failTransfer = true;
    await confirm(buyer, order.id, fA);
    let f = await fulfillment(order.id, fA);
    expect([f.payout.status, f.payout.error]).to.deep.equal(['failed', 'insufficient platform balance']);

    failTransfer = false;
    expect(await releasePendingPayouts(orgA)).to.equal(1);
    f = await fulfillment(order.id, fA);
    expect(f.payout.status).to.equal('paid');
    expect(f.payout.error).to.equal(undefined);
  });

  it('lets a seller cancel before shipping: partial refund and restock', async () => {
    const { order, a, fA, fB } = await paidOrder();
    const noReason = await chai.request(app).post(`/api/sales/${order.id}/fulfillments/${fA}/cancel`)
      .set('Authorization', bearer(sellerA)).send({});
    expect(noReason).to.have.status(400);

    const res = await chai.request(app).post(`/api/sales/${order.id}/fulfillments/${fA}/cancel`)
      .set('Authorization', bearer(sellerA)).send({ reason: 'Failed pre-shipment inspection' });
    expect(res).to.have.status(200);
    expect(calls.refund).to.deep.equal([[order.stripePaymentIntentId, 100000, `refund_${fA}`]]);
    expect((await fulfillment(order.id, fA)).status).to.equal('cancelled');
    expect((await fulfillment(order.id, fB)).status).to.equal('awaiting_shipment');
    expect((await Product.findById(a.id))!.stock).to.equal(3);
  });

  it('puts a cancellation back if Stripe refuses the refund', async () => {
    const { order, a, fA } = await paidOrder();
    failRefund = true;
    const res = await chai.request(app).post(`/api/sales/${order.id}/fulfillments/${fA}/cancel`)
      .set('Authorization', bearer(sellerA)).send({ reason: 'Out of stock' });
    expect(res).to.have.status(502);
    expect((await fulfillment(order.id, fA)).status).to.equal('awaiting_shipment');
    expect((await Product.findById(a.id))!.stock).to.equal(2);
  });

  describe('disputes', () => {
    const dispute = (token: string, orderId: string, fid: string, reason?: string) => chai.request(app)
      .post(`/api/orders/${orderId}/fulfillments/${fid}/dispute`).set('Authorization', bearer(token)).send({ reason });
    const resolve = (token: string, orderId: string, fid: string, action: string, note = 'Reviewed photos') =>
      chai.request(app).post(`/api/admin/orders/${orderId}/fulfillments/${fid}/resolve`)
        .set('Authorization', bearer(token)).send({ action, note });

    it('freezes the fulfillment until an admin decides', async () => {
      const { order, fA } = await paidOrder();
      await ship(sellerA, order.id, fA);
      expect(await dispute(buyer, order.id, fA)).to.have.status(400);
      expect(await dispute(buyer, order.id, fA, 'Arrived with a cracked screen')).to.have.status(200);
      expect(await confirm(buyer, order.id, fA)).to.have.status(409);

      const queue = await chai.request(app).get('/api/admin/disputes').set('Authorization', bearer(adminToken));
      expect(queue.body).to.have.length(1);
      expect(queue.body[0].fulfillment.dispute.reason).to.equal('Arrived with a cracked screen');
      expect(await resolve(buyer, order.id, fA, 'refund')).to.have.status(403);
    });

    it('refunds the buyer when the admin rules for them', async () => {
      const { order, fA } = await paidOrder();
      await ship(sellerA, order.id, fA);
      await dispute(buyer, order.id, fA, 'Wrong model delivered');
      expect(await resolve(adminToken, order.id, fA, 'refund')).to.have.status(200);
      const f = await fulfillment(order.id, fA);
      expect([f.status, f.dispute!.resolution, f.refundId]).to.deep.equal(['refunded', 'refund', 're_1']);
      expect(calls.transfer).to.have.length(0);
    });

    it('pays the seller when the admin rules for them', async () => {
      const { order, fA } = await paidOrder();
      await onboard(orgA);
      await ship(sellerA, order.id, fA);
      await dispute(buyer, order.id, fA, 'Not sure it works');
      expect(await resolve(adminToken, order.id, fA, 'release', '')).to.have.status(400);
      expect(await resolve(adminToken, order.id, fA, 'release')).to.have.status(200);
      const f = await fulfillment(order.id, fA);
      expect([f.status, f.payout.status]).to.deep.equal(['delivered', 'paid']);
      expect(calls.refund).to.have.length(0);
    });

    it('never pays out for equipment that was not shipped; the order carries on instead', async () => {
      const { order, fA } = await paidOrder();
      await onboard(orgA);
      await dispute(buyer, order.id, fA, 'Seller is not answering');
      const res = await resolve(adminToken, order.id, fA, 'release', 'Seller replied, shipping Monday');
      expect(res.body.msg).to.equal('Dispute dismissed; the seller can ship');
      const f = await fulfillment(order.id, fA);
      expect([f.status, f.payout.status, f.dispute!.resolution]).to.deep.equal(['awaiting_shipment', 'not_due', 'release']);
      expect(calls.transfer).to.have.length(0);
      expect(await ship(sellerA, order.id, fA)).to.have.status(200);
    });
  });

  describe('Stripe Connect onboarding', () => {
    it('creates one Express account per organization and returns an onboarding link', async () => {
      let created = 0;
      stripeOps.createExpressAccount = async () => {
        created++;
        return { id: 'acct_onboard', detailsSubmitted: false, payoutsEnabled: false };
      };
      stripeOps.createOnboardingLink = async (id, returnUrl) => `https://connect.stripe.test/${id}?return=${returnUrl}`;

      const first = await chai.request(app).post('/api/payouts/onboarding').set('Authorization', bearer(sellerA));
      expect(first.body.url).to.match(/acct_onboard\?return=.*\/organization\?stripe=return/);
      await chai.request(app).post('/api/payouts/onboarding').set('Authorization', bearer(sellerA));
      expect(created).to.equal(1);

      const status = await chai.request(app).get('/api/payouts/status').set('Authorization', bearer(sellerA));
      expect(status.body).to.deep.equal({ connected: true, detailsSubmitted: false, payoutsEnabled: false });
    });

    it('does not expose the Stripe account id on the public seller profile', async () => {
      await onboard(orgA);
      const res = await chai.request(app).get(`/api/organizations/${orgA}`);
      expect(res.body).to.not.have.property('stripeAccountId');
    });

    it('updates the seller and releases payouts from a signed account.updated webhook', async () => {
      const { order, fA } = await paidOrder();
      await Organization.updateOne({ _id: orgA }, { stripeAccountId: 'acct_hook' });
      await ship(sellerA, order.id, fA);
      await confirm(buyer, order.id, fA);

      const payload = JSON.stringify({
        id: 'evt_1', object: 'event', type: 'account.updated',
        data: { object: { id: 'acct_hook', object: 'account', details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' } } }
      });
      const post = (signature: string) => chai.request(app).post('/api/payment/webhook')
        .set('Content-Type', 'application/json').set('stripe-signature', signature).send(payload);

      expect(await post('t=1,v1=forged')).to.have.status(400);
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_connect_secret' });
      expect(await post(signature)).to.have.status(200);

      const org = await Organization.findById(orgA);
      expect(org!.payoutsEnabled).to.equal(true);
      expect((await fulfillment(order.id, fA)).payout.status).to.equal('paid');
    });
  });
});
