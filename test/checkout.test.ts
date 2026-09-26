import { expect } from 'chai';
import { Types } from 'mongoose';
import '../app';
import Product from '../models/Product';
import Order from '../models/Order';
import {
  CheckoutError,
  SHIPPING_CENTS,
  createPendingOrder,
  finalizeOrder,
  priceCart
} from '../services/checkout';

const makeProduct = (price: number, stock: number) => Product.create({
  title: `Test product ${price}`,
  description: 'test',
  price,
  stock,
  imageUrl: 'x.png',
  category: new Types.ObjectId(),
  seller: new Types.ObjectId(),
  organization: new Types.ObjectId(),
  manufacturer: 'Test Medical',
  deviceModel: 'T-100',
  deviceClass: 'II',
  condition: 'used_good',
  location: { province: 'ON', city: 'Toronto' }
});

const expectCheckoutError = async (p: Promise<unknown>, status: number) => {
  try {
    await p;
  } catch (err) {
    expect(err).to.be.instanceOf(CheckoutError);
    expect((err as CheckoutError).status).to.equal(status);
    return;
  }
  expect.fail('expected a CheckoutError');
};

describe('Checkout', () => {
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    await Product.deleteMany({});
    await Order.deleteMany({});
  });

  describe('priceCart', () => {
    it('prices from the database and ignores any client-supplied price', async () => {
      const p = await makeProduct(19.99, 10);
      const cart = await priceCart([{ productId: p.id, quantity: 3, price: 0.01 }]);
      expect(cart.subtotalCents).to.equal(5997);
      expect(cart.totalCents).to.equal(5997 + SHIPPING_CENTS);
      expect(cart.items[0].price).to.equal(19.99);
    });

    it('merges duplicate lines for the same product', async () => {
      const p = await makeProduct(10, 10);
      const cart = await priceCart([
        { productId: p.id, quantity: 1 },
        { productId: p.id, quantity: 2 }
      ]);
      expect(cart.items).to.have.length(1);
      expect(cart.items[0].quantity).to.equal(3);
    });

    it('rejects quantities above stock', async () => {
      const p = await makeProduct(10, 2);
      await expectCheckoutError(priceCart([{ productId: p.id, quantity: 3 }]), 409);
    });

    it('rejects empty carts, bad quantities and unknown products', async () => {
      const p = await makeProduct(10, 2);
      await expectCheckoutError(priceCart([]), 400);
      await expectCheckoutError(priceCart([{ productId: p.id, quantity: 0 }]), 400);
      await expectCheckoutError(priceCart([{ productId: p.id, quantity: 1.5 }]), 400);
      await expectCheckoutError(priceCart([{ productId: new Types.ObjectId().toString(), quantity: 1 }]), 400);
    });
  });

  describe('finalizeOrder', () => {
    const setup = async (stock: number, quantity: number) => {
      const product = await makeProduct(50, stock);
      const cart = await priceCart([{ productId: product.id, quantity }]);
      const order = await createPendingOrder(userId, cart);
      order.stripePaymentIntentId = `pi_${order.id}`;
      await order.save();
      const pi = { id: order.stripePaymentIntentId, status: 'succeeded', amount: order.totalCents, currency: 'cad' };
      return { product, order, pi };
    };

    const noRefund = async () => { throw new Error('refund should not be called'); };

    it('marks the order paid and decrements stock', async () => {
      const { product, order, pi } = await setup(5, 2);
      const result = await finalizeOrder(order.id, pi, noRefund);
      expect(result.status).to.equal('paid');
      expect((await Product.findById(product.id))!.stock).to.equal(3);
    });

    it('is idempotent: a second call does not decrement stock again', async () => {
      const { product, order, pi } = await setup(5, 2);
      await finalizeOrder(order.id, pi, noRefund);
      const again = await finalizeOrder(order.id, pi, noRefund);
      expect(again.status).to.equal('paid');
      expect((await Product.findById(product.id))!.stock).to.equal(3);
    });

    it('decrements stock once when called concurrently (webhook + client race)', async () => {
      const { product, order, pi } = await setup(5, 2);
      await Promise.all([
        finalizeOrder(order.id, pi, noRefund),
        finalizeOrder(order.id, pi, noRefund)
      ]);
      expect((await Product.findById(product.id))!.stock).to.equal(3);
    });

    it('refuses a payment whose amount does not match the order', async () => {
      const { order, pi } = await setup(5, 1);
      await expectCheckoutError(finalizeOrder(order.id, { ...pi, amount: 100 }, noRefund), 400);
      expect((await Order.findById(order.id))!.status).to.equal('pending');
    });

    it('refuses a payment that has not succeeded', async () => {
      const { order, pi } = await setup(5, 1);
      await expectCheckoutError(finalizeOrder(order.id, { ...pi, status: 'requires_payment_method' }, noRefund), 402);
    });

    it('refuses a PaymentIntent that belongs to a different order', async () => {
      const { order, pi } = await setup(5, 1);
      await expectCheckoutError(finalizeOrder(order.id, { ...pi, id: 'pi_other' }, noRefund), 400);
    });

    it('refunds and restores stock when an item sold out mid-checkout', async () => {
      const a = await makeProduct(10, 5);
      const b = await makeProduct(20, 5);
      const cart = await priceCart([
        { productId: a.id, quantity: 2 },
        { productId: b.id, quantity: 2 }
      ]);
      const order = await createPendingOrder(userId, cart);
      order.stripePaymentIntentId = 'pi_soldout';
      await order.save();

      // Someone else buys the rest of product b before this payment lands.
      await Product.updateOne({ _id: b._id }, { stock: 1 });

      const refunded: string[] = [];
      const result = await finalizeOrder(
        order.id,
        { id: 'pi_soldout', status: 'succeeded', amount: order.totalCents, currency: 'cad' },
        async id => { refunded.push(id); }
      );

      expect(result.status).to.equal('refunded');
      expect(refunded).to.deep.equal(['pi_soldout']);
      expect((await Product.findById(a.id))!.stock).to.equal(5);
      expect((await Product.findById(b.id))!.stock).to.equal(1);
    });
  });
});
