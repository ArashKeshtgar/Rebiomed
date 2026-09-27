import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import { Types } from 'mongoose';
import app from '../app';
import { CheckoutError, createPendingOrder, finalizeOrder, priceCart } from '../services/checkout';
import User from '../models/User';
import Organization from '../models/Organization';
import Product from '../models/Product';
import Offer from '../models/Offer';
import Order from '../models/Order';

chai.use(chaiHttp);

const bearer = (t: string) => `Bearer ${t}`;

const register = async (email: string) => {
  const res = await chai.request(app).post('/api/auth/register')
    .send({ name: email.split('@')[0], email, password: 'password123' });
  return res.body.token as string;
};

describe('Offers', () => {
  let buyer: string, otherBuyer: string, seller: string, outsiderSeller: string;
  let buyerId: string, otherBuyerId: string;
  let orgId: string;
  let productId: string;

  const post = (token: string, path: string, body: object = {}) =>
    chai.request(app).post(`/api/offers${path}`).set('Authorization', bearer(token)).send(body);
  const offer = (token: string, amount: unknown, pid = productId) =>
    post(token, '', { productId: pid, amount, message: 'Can you do better?' });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Organization.deleteMany({}), Product.deleteMany({}), Offer.deleteMany({}), Order.deleteMany({})]);
    buyer = await register('buyer@test.ca');
    otherBuyer = await register('other@test.ca');
    seller = await register('seller@test.ca');
    outsiderSeller = await register('outsider@test.ca');
    buyerId = (await User.findOne({ email: 'buyer@test.ca' }))!.id;
    otherBuyerId = (await User.findOne({ email: 'other@test.ca' }))!.id;

    const org = await chai.request(app).post('/api/organizations').set('Authorization', bearer(seller))
      .send({ name: 'Seller Co', type: 'dealer', province: 'BC', city: 'Victoria' });
    orgId = org.body._id;
    await chai.request(app).post('/api/organizations').set('Authorization', bearer(outsiderSeller))
      .send({ name: 'Other Co', type: 'dealer', province: 'BC', city: 'Victoria' });

    productId = (await Product.create({
      title: 'Ultrasound', description: 'x', price: 10000, stock: 2, imageUrl: 'x.png',
      category: new Types.ObjectId(), seller: new Types.ObjectId(), organization: orgId,
      manufacturer: 'M', deviceModel: 'U', deviceClass: 'II', condition: 'used_good',
      location: { province: 'BC', city: 'Victoria' }
    })).id;
  });

  describe('making an offer', () => {
    it('records an offer below the listed price', async () => {
      const res = await offer(buyer, '8500.50');
      expect(res).to.have.status(200);
      expect(res.body).to.include({ status: 'pending', amountCents: 850050, organization: orgId });
    });

    it('rejects offers at or above the price, non-positive amounts and fractions of a cent', async () => {
      expect((await offer(buyer, 10000)).body.msg).to.match(/below the listed price of CA\$10,000\.00/);
      expect(await offer(buyer, 0)).to.have.status(400);
      expect(await offer(buyer, 'abc')).to.have.status(400);
      expect(await offer(buyer, '99.999')).to.have.status(400);
    });

    it('does not let a seller make an offer on its own listing', async () => {
      expect(await offer(seller, 5000)).to.have.status(400);
    });

    it('allows only one open offer per buyer and listing, even when two requests race', async () => {
      const [a, b] = await Promise.all([offer(buyer, 8000), offer(buyer, 8100)]);
      expect([a.status, b.status].sort()).to.deep.equal([200, 409]);
      expect(await offer(otherBuyer, 8000)).to.have.status(200);
    });

    it('lets the buyer offer again once the previous offer is closed', async () => {
      const first = await offer(buyer, 8000);
      await post(buyer, `/${first.body._id}/withdraw`);
      expect(await offer(buyer, 8200)).to.have.status(200);
    });
  });

  describe('negotiating', () => {
    it('lets only the listing organization accept, and then holds the price for checkout', async () => {
      const id = (await offer(buyer, 9000)).body._id;
      expect(await post(outsiderSeller, `/${id}/accept`)).to.have.status(404);
      expect(await post(buyer, `/${id}/accept`)).to.have.status(404);
      const res = await post(seller, `/${id}/accept`);
      expect(res.body).to.include({ status: 'accepted', agreedAmountCents: 900000 });
      const hours = (new Date(res.body.acceptedUntil).getTime() - Date.now()) / 3600000;
      expect(hours).to.be.closeTo(72, 0.1);
    });

    it('supports a counter-offer the buyer can accept', async () => {
      const id = (await offer(buyer, 8000)).body._id;
      expect(await post(seller, `/${id}/counter`, { amount: 7000 })).to.have.status(400);
      expect(await post(seller, `/${id}/counter`, { amount: 10000 })).to.have.status(400);
      const countered = await post(seller, `/${id}/counter`, { amount: 9200, note: 'Includes probe' });
      expect(countered.body).to.include({ status: 'countered', counterAmountCents: 920000, sellerNote: 'Includes probe' });

      expect(await post(otherBuyer, `/${id}/accept-counter`)).to.have.status(404);
      const accepted = await post(buyer, `/${id}/accept-counter`);
      expect(accepted.body).to.include({ status: 'accepted', agreedAmountCents: 920000 });
    });

    it('refuses to act on a closed offer', async () => {
      const id = (await offer(buyer, 8000)).body._id;
      await post(seller, `/${id}/decline`, { note: 'Too low' });
      const res = await post(seller, `/${id}/accept`);
      expect(res).to.have.status(409);
      expect(res.body.msg).to.match(/declined/);
    });

    it('lets an unanswered offer lapse after its deadline', async () => {
      const id = (await offer(buyer, 8000)).body._id;
      await Offer.updateOne({ _id: id }, { expiresAt: new Date(Date.now() - 1000) });
      expect(await post(seller, `/${id}/accept`)).to.have.status(409);
      expect((await Offer.findById(id))!.status).to.equal('expired');
    });

    it('lists offers made and received for the right people only', async () => {
      await offer(buyer, 8000);
      const mine = await chai.request(app).get('/api/offers/mine').set('Authorization', bearer(buyer));
      expect(mine.body).to.have.length(1);
      expect(mine.body[0].product.title).to.equal('Ultrasound');
      const received = await chai.request(app).get('/api/offers/received').set('Authorization', bearer(seller));
      expect(received.body[0].buyer.email).to.equal('buyer@test.ca');
      const other = await chai.request(app).get('/api/offers/received').set('Authorization', bearer(outsiderSeller));
      expect(other.body).to.have.length(0);
    });
  });

  describe('checking out at the agreed price', () => {
    const acceptedOffer = async (amount = 9000) => {
      const id = (await offer(buyer, amount)).body._id;
      await post(seller, `/${id}/accept`);
      return id as string;
    };

    const payFor = async (userId: string, lines: object[]) => {
      const cart = await priceCart(lines, userId);
      const order = await createPendingOrder(userId, cart);
      order.stripePaymentIntentId = `pi_${order.id}`;
      await order.save();
      let refunded = false;
      const paid = await finalizeOrder(order.id, {
        id: order.stripePaymentIntentId, status: 'succeeded', amount: order.totalCents, currency: 'cad'
      }, async () => { refunded = true; });
      return { paid, refunded };
    };

    const expectRejected = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (err) {
        expect(err).to.be.instanceOf(CheckoutError);
        return (err as CheckoutError).message;
      }
      return expect.fail('expected a CheckoutError');
    };

    it('prices the line from the offer, not the listing or the client', async () => {
      const offerId = await acceptedOffer(9000);
      const cart = await priceCart([{ productId, quantity: 1, offerId, price: 1 }], buyerId);
      expect(cart.subtotalCents).to.equal(900000);
      expect(cart.items[0].price).to.equal(9000);
      expect(String(cart.items[0].offer)).to.equal(offerId);
    });

    it('honours the offer only for its buyer, one unit, while it is valid', async () => {
      const offerId = await acceptedOffer();
      expect(await expectRejected(priceCart([{ productId, quantity: 1, offerId }], otherBuyerId))).to.match(/no longer available/);
      expect(await expectRejected(priceCart([{ productId, quantity: 2, offerId }], buyerId))).to.match(/one unit/);
      expect(await expectRejected(priceCart([{ productId, quantity: 1, offerId }, { productId, quantity: 1 }], buyerId))).to.match(/one unit/);

      await Offer.updateOne({ _id: offerId }, { acceptedUntil: new Date(Date.now() - 1000) });
      expect(await expectRejected(priceCart([{ productId, quantity: 1, offerId }], buyerId))).to.match(/no longer available/);
    });

    it('cannot use an offer the seller has not accepted', async () => {
      const offerId = (await offer(buyer, 9000)).body._id;
      expect(await expectRejected(priceCart([{ productId, quantity: 1, offerId }], buyerId))).to.match(/no longer available/);
    });

    it('marks the offer used when paid, so it cannot be used again', async () => {
      const offerId = await acceptedOffer();
      const { paid } = await payFor(buyerId, [{ productId, quantity: 1, offerId }]);
      expect(paid.status).to.equal('paid');
      const used = (await Offer.findById(offerId))!;
      expect([used.status, String(used.usedByOrder)]).to.deep.equal(['used', paid.id]);
      await expectRejected(priceCart([{ productId, quantity: 1, offerId }], buyerId));
    });

    it('refunds a second order that paid with the same offer at the same time', async () => {
      const offerId = await acceptedOffer();
      // Both carts are priced while the offer is still valid, then both pay.
      const lines = [{ productId, quantity: 1, offerId }];
      const carts = await Promise.all([priceCart(lines, buyerId), priceCart(lines, buyerId)]);
      const orders = await Promise.all(carts.map(async c => {
        const o = await createPendingOrder(buyerId, c);
        o.stripePaymentIntentId = `pi_${o.id}`;
        return o.save();
      }));
      const refunds: string[] = [];
      const results = await Promise.all(orders.map(o => finalizeOrder(o.id, {
        id: o.stripePaymentIntentId!, status: 'succeeded', amount: o.totalCents, currency: 'cad'
      }, async pi => { refunds.push(pi); })));

      expect(results.map(r => r.status).sort()).to.deep.equal(['paid', 'refunded']);
      expect(refunds).to.have.length(1);
      expect((await Product.findById(productId))!.stock).to.equal(1);
    });

    it('gives the offer back if the paid order is refunded because stock ran out', async () => {
      const offerId = await acceptedOffer();
      const cart = await priceCart([{ productId, quantity: 1, offerId }], buyerId);
      const order = await createPendingOrder(buyerId, cart);
      order.stripePaymentIntentId = `pi_${order.id}`;
      await order.save();
      await Product.updateOne({ _id: productId }, { stock: 0 });

      const result = await finalizeOrder(order.id, {
        id: order.stripePaymentIntentId, status: 'succeeded', amount: order.totalCents, currency: 'cad'
      }, async () => {});
      expect(result.status).to.equal('refunded');
      const back = (await Offer.findById(offerId))!;
      expect([back.status, back.usedByOrder, back.openKey]).to.deep.equal(['accepted', undefined, `${buyerId}:${productId}`]);
    });
  });
});
