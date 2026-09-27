import { Types } from 'mongoose';
import Offer, { IOffer, OfferStatus } from '../models/Offer';
import Product from '../models/Product';
import User from '../models/User';
import { ACCEPTED_OFFER_HOURS, OFFER_RESPONSE_DAYS } from '../config/medical';

// Buyer/seller price negotiation on a single listing. Like fulfillment, each
// step is one conditional update on the offer's current status (and deadline),
// so a seller accepting while the buyer withdraws can't both succeed.

export class OfferError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const responseDeadline = () => new Date(Date.now() + OFFER_RESPONSE_DAYS * DAY);
const checkoutDeadline = () => new Date(Date.now() + ACCEPTED_OFFER_HOURS * HOUR);

const formatCad = (cents: number) =>
  `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Parses a dollar amount from the request into cents.
export const parseAmount = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) throw new OfferError('Enter an amount greater than 0');
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) throw new OfferError('Amounts can have at most two decimals');
  return cents;
};

const note = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > 1000) throw new OfferError('Message is too long');
  return text || undefined;
};

// Offers past their deadline are closed lazily, whenever offers are read or
// changed, rather than by a background job.
export async function expireStale(): Promise<void> {
  const now = new Date();
  await Offer.updateMany(
    { status: { $in: ['pending', 'countered'] }, expiresAt: { $lte: now } },
    { $set: { status: 'expired' }, $unset: { openKey: '' } }
  );
  await Offer.updateMany(
    { status: 'accepted', acceptedUntil: { $lte: now } },
    { $set: { status: 'expired' }, $unset: { openKey: '' } }
  );
}

export async function organizationOf(userId: string): Promise<string | null> {
  const user = await User.findById(userId).select('organization');
  return user?.organization ? user.organization.toString() : null;
}

export async function makeOffer(buyerId: string, productId: unknown, amount: unknown, message: unknown): Promise<IOffer> {
  const id = String(productId ?? '');
  const product = Types.ObjectId.isValid(id) ? await Product.findById(id) : null;
  if (!product || product.suspended) throw new OfferError('Listing not found', 404);
  if (product.stock < 1) throw new OfferError('This listing is sold out', 409);
  if (product.organization.toString() === await organizationOf(buyerId)) {
    throw new OfferError("You can't make an offer on your own organization's listing");
  }

  const amountCents = parseAmount(amount);
  const priceCents = Math.round(product.price * 100);
  if (amountCents >= priceCents) {
    throw new OfferError(`An offer must be below the listed price of ${formatCad(priceCents)}; at that price, just buy it`);
  }

  await expireStale();
  try {
    return await Offer.create({
      product: product._id,
      organization: product.organization,
      buyer: buyerId,
      amountCents,
      message: note(message),
      expiresAt: responseDeadline(),
      openKey: `${buyerId}:${product.id}`
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new OfferError('You already have an open offer on this listing', 409);
    }
    throw err;
  }
}

// Applies an update if the offer is in one of `from` statuses and the caller
// owns it; otherwise explains why (404 if not theirs, 409 if wrong state).
async function transition(
  offerId: string,
  owner: { buyer?: string; organization?: string },
  from: OfferStatus[],
  update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
  action: string,
  extra: Record<string, unknown> = {}
): Promise<IOffer> {
  if (!Types.ObjectId.isValid(offerId)) throw new OfferError('Offer not found', 404);
  await expireStale();
  const updated = await Offer.findOneAndUpdate(
    { _id: offerId, ...owner, status: { $in: from }, ...extra },
    update,
    { new: true }
  );
  if (updated) return updated;

  const offer = await Offer.findOne({ _id: offerId, ...owner });
  if (!offer) throw new OfferError('Offer not found', 404);
  throw new OfferError(`Cannot ${action} an offer that is ${offer.status}`, 409);
}

const close = (status: OfferStatus, set: Record<string, unknown> = {}) =>
  ({ $set: { status, ...set }, $unset: { openKey: '' as const } });

// ---- seller ----------------------------------------------------------------

export async function acceptOffer(offerId: string, organizationId: string): Promise<IOffer> {
  const offer = Types.ObjectId.isValid(offerId) ? await Offer.findOne({ _id: offerId, organization: organizationId }) : null;
  if (!offer) throw new OfferError('Offer not found', 404);
  return transition(offerId, { organization: organizationId }, ['pending'],
    { $set: { status: 'accepted', agreedAmountCents: offer.amountCents, acceptedUntil: checkoutDeadline() } },
    'accept', { amountCents: offer.amountCents });
}

export async function declineOffer(offerId: string, organizationId: string, sellerNote: unknown): Promise<IOffer> {
  return transition(offerId, { organization: organizationId }, ['pending', 'countered'],
    close('declined', { sellerNote: note(sellerNote) }), 'decline');
}

export async function counterOffer(offerId: string, organizationId: string, amount: unknown, sellerNote: unknown): Promise<IOffer> {
  const offer = Types.ObjectId.isValid(offerId) ? await Offer.findOne({ _id: offerId, organization: organizationId }) : null;
  if (!offer) throw new OfferError('Offer not found', 404);
  const product = await Product.findById(offer.product);
  const counterCents = parseAmount(amount);
  const priceCents = Math.round((product?.price ?? 0) * 100);
  if (counterCents <= offer.amountCents) {
    throw new OfferError(`A counter-offer must be above the buyer's ${formatCad(offer.amountCents)}; to agree, accept the offer`);
  }
  if (counterCents >= priceCents) {
    throw new OfferError(`A counter-offer must be below your listed price of ${formatCad(priceCents)}`);
  }
  return transition(offerId, { organization: organizationId }, ['pending'],
    { $set: { status: 'countered', counterAmountCents: counterCents, sellerNote: note(sellerNote), expiresAt: responseDeadline() } },
    'counter');
}

// ---- buyer -----------------------------------------------------------------

export async function acceptCounter(offerId: string, buyerId: string): Promise<IOffer> {
  const offer = Types.ObjectId.isValid(offerId) ? await Offer.findOne({ _id: offerId, buyer: buyerId }) : null;
  if (!offer) throw new OfferError('Offer not found', 404);
  return transition(offerId, { buyer: buyerId }, ['countered'],
    { $set: { status: 'accepted', agreedAmountCents: offer.counterAmountCents, acceptedUntil: checkoutDeadline() } },
    'accept the counter-offer on', { counterAmountCents: offer.counterAmountCents });
}

export async function withdrawOffer(offerId: string, buyerId: string): Promise<IOffer> {
  return transition(offerId, { buyer: buyerId }, ['pending', 'countered', 'accepted'], close('withdrawn'), 'withdraw');
}

// ---- checkout --------------------------------------------------------------

// The accepted offer a buyer may check out with right now, or null.
export async function usableOffer(offerId: string, buyerId: string, productId: string): Promise<IOffer | null> {
  if (!Types.ObjectId.isValid(offerId)) return null;
  return Offer.findOne({
    _id: offerId, buyer: buyerId, product: productId, status: 'accepted', acceptedUntil: { $gt: new Date() }
  });
}

// Marks offers used by a paid order. An offer that was valid when the order
// was created is honoured even if its checkout window closed during payment.
// Returns false (claiming nothing) if any offer was already used or withdrawn.
export async function claimOffers(offerIds: Types.ObjectId[], orderId: Types.ObjectId, orderCreatedAt: Date): Promise<boolean> {
  const claimed: Types.ObjectId[] = [];
  for (const id of offerIds) {
    const res = await Offer.updateOne(
      {
        _id: id,
        status: { $in: ['accepted', 'expired'] },
        agreedAmountCents: { $exists: true },
        acceptedUntil: { $gte: orderCreatedAt },
        usedByOrder: { $exists: false }
      },
      { $set: { status: 'used', usedByOrder: orderId }, $unset: { openKey: '' } }
    );
    if (res.modifiedCount !== 1) {
      await releaseOffers(claimed, orderId);
      return false;
    }
    claimed.push(id);
  }
  return true;
}

// Undoes claimOffers for an order that was refunded before completing.
export async function releaseOffers(offerIds: Types.ObjectId[], orderId: Types.ObjectId): Promise<void> {
  if (!offerIds.length) return;
  const filter = { _id: { $in: offerIds }, usedByOrder: orderId };
  try {
    // Re-open with its openKey so the one-open-offer-per-listing rule holds.
    await Offer.updateMany(filter, [
      { $set: { status: 'accepted', openKey: { $concat: [{ $toString: '$buyer' }, ':', { $toString: '$product' }] } } },
      { $unset: 'usedByOrder' }
    ]);
  } catch {
    // The buyer opened another offer meanwhile; reopen without the key.
    await Offer.updateMany(filter, { $set: { status: 'accepted' }, $unset: { usedByOrder: '' } });
  }
}
