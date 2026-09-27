import stripe from './stripe';
import { CURRENCY } from './checkout';

// Every Stripe call made by fulfillment and Connect code goes through this
// object, so tests can replace individual methods without a real Stripe
// account. Money-moving calls take an idempotency key so a retry can never
// refund or pay out twice.

export interface AccountState {
  id: string;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
}

export const toAccountState = (a: {
  id: string;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  capabilities?: { transfers?: string } | null;
}): AccountState => ({
  id: a.id,
  detailsSubmitted: !!a.details_submitted,
  // Transfers to the account need the transfers capability to be active, not
  // just payouts from the account to its bank.
  payoutsEnabled: !!a.payouts_enabled && a.capabilities?.transfers === 'active'
});

export const stripeOps = {
  async refund(paymentIntentId: string, amountCents: number | undefined, idempotencyKey: string) {
    const r = await stripe.refunds.create(
      { payment_intent: paymentIntentId, ...(amountCents ? { amount: amountCents } : {}) },
      { idempotencyKey }
    );
    return { id: r.id };
  },

  async transfer(
    p: { amountCents: number; destination: string; transferGroup: string; sourceTransaction?: string; metadata: Record<string, string> },
    idempotencyKey: string
  ) {
    const t = await stripe.transfers.create({
      amount: p.amountCents,
      currency: CURRENCY,
      destination: p.destination,
      transfer_group: p.transferGroup,
      ...(p.sourceTransaction ? { source_transaction: p.sourceTransaction } : {}),
      metadata: p.metadata
    }, { idempotencyKey });
    return { id: t.id };
  },

  async createExpressAccount(email: string, organizationId: string) {
    const a = await stripe.accounts.create({
      type: 'express',
      country: 'CA',
      email,
      business_type: 'company',
      capabilities: { transfers: { requested: true } },
      metadata: { organizationId }
    });
    return toAccountState(a);
  },

  async createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl
    });
    return link.url;
  },

  async retrieveAccount(accountId: string) {
    return toAccountState(await stripe.accounts.retrieve(accountId));
  },

  async createDashboardLink(accountId: string) {
    return (await stripe.accounts.createLoginLink(accountId)).url;
  }
};
