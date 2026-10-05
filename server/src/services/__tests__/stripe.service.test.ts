import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus } from '@prisma/client';

const {
  mockPrisma,
  mockStripeCustomers,
  mockStripeCheckoutSessions,
  mockStripeSubscriptions,
  mockStripeWebhooks,
} = vi.hoisted(() => ({
  mockPrisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  mockStripeCustomers: {
    create: vi.fn(),
  },
  mockStripeCheckoutSessions: {
    create: vi.fn(),
  },
  mockStripeSubscriptions: {
    retrieve: vi.fn(),
  },
  mockStripeWebhooks: {
    constructEvent: vi.fn(),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      customers = mockStripeCustomers;
      checkout = { sessions: mockStripeCheckoutSessions };
      subscriptions = mockStripeSubscriptions;
      webhooks = mockStripeWebhooks;
    },
  };
});

import {
  createCheckoutSession,
  getOrCreateStripeCustomer,
  handleWebhookEvent,
  mapStripeStatusToPrisma,
} from '../stripe.service';

describe('Stripe Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapStripeStatusToPrisma', () => {
    it('maps Stripe status strings to Prisma SubscriptionStatus enum', () => {
      expect(mapStripeStatusToPrisma('trialing')).toBe(SubscriptionStatus.TRIALING);
      expect(mapStripeStatusToPrisma('active')).toBe(SubscriptionStatus.ACTIVE);
      expect(mapStripeStatusToPrisma('past_due')).toBe(SubscriptionStatus.PAST_DUE);
      expect(mapStripeStatusToPrisma('canceled')).toBe(SubscriptionStatus.CANCELLED);
      expect(mapStripeStatusToPrisma('unpaid')).toBe(SubscriptionStatus.EXPIRED);
      expect(mapStripeStatusToPrisma('incomplete')).toBe(SubscriptionStatus.EXPIRED);
    });
  });

  describe('getOrCreateStripeCustomer', () => {
    it('reuses existing Stripe customer ID when present', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        stripeCustomerId: 'cus_existing123',
      });

      const customerId = await getOrCreateStripeCustomer({
        organizationId: 'org-1',
      });

      expect(customerId).toBe('cus_existing123');
      expect(mockStripeCustomers.create).not.toHaveBeenCalled();
    });

    it('creates new Stripe customer and updates organization subscription when missing', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        stripeCustomerId: null,
      });

      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
      });

      mockStripeCustomers.create.mockResolvedValue({
        id: 'cus_new123',
      });

      mockPrisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        stripeCustomerId: 'cus_new123',
      });

      const customerId = await getOrCreateStripeCustomer({
        organizationId: 'org-1',
      });

      expect(customerId).toBe('cus_new123');
      expect(mockStripeCustomers.create).toHaveBeenCalledWith({
        name: 'Acme Corp',
        metadata: { organizationId: 'org-1' },
      });
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { stripeCustomerId: 'cus_new123' },
      });
    });

    it('throws error if organization subscription is missing', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(
        getOrCreateStripeCustomer({ organizationId: 'org-missing' }),
      ).rejects.toThrow('Organization subscription not found');
    });

    it('throws error if organization entity is missing', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        stripeCustomerId: null,
      });
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        getOrCreateStripeCustomer({ organizationId: 'org-1' }),
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('createCheckoutSession', () => {
    const starterPlan = {
      id: 'plan-starter',
      name: 'Starter',
      priceInPaise: 49900,
    };

    const freePlan = {
      id: 'plan-free',
      name: 'Free',
      priceInPaise: 0,
    };

    it('creates a checkout session for a valid paid plan with metadata', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue(starterPlan);
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        stripeCustomerId: 'cus_123',
      });

      mockStripeCheckoutSessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });

      const result = await createCheckoutSession({
        organizationId: 'org-1',
        planId: 'plan-starter',
      });

      expect(result).toEqual({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });

      expect(mockStripeCheckoutSessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_123',
          mode: 'subscription',
          metadata: {
            organizationId: 'org-1',
            planId: 'plan-starter',
          },
          subscription_data: {
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-starter',
            },
          },
        }),
      );
    });

    it('rejects nonexistent plan cleanly', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        createCheckoutSession({
          organizationId: 'org-1',
          planId: 'plan-invalid',
        }),
      ).rejects.toThrow('Plan not found');
    });

    it('rejects Free plan checkout requests', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue(freePlan);

      await expect(
        createCheckoutSession({
          organizationId: 'org-1',
          planId: 'plan-free',
        }),
      ).rejects.toThrow('Free plan cannot be purchased via Stripe checkout');
    });

    it('rejects plan without configured price mapping', async () => {
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-custom',
        name: 'EnterpriseCustom',
        priceInPaise: 999900,
      });

      await expect(
        createCheckoutSession({
          organizationId: 'org-1',
          planId: 'plan-custom',
        }),
      ).rejects.toThrow('Stripe price not configured for this plan');
    });
  });

  describe('handleWebhookEvent', () => {
    it('throws error when signature verification fails', async () => {
      mockStripeWebhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        handleWebhookEvent(Buffer.from('test'), 'bad_sig'),
      ).rejects.toThrow('Webhook signature verification failed: Invalid signature');
    });

    it('handles checkout.session.completed event and creates audit log on plan change', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_stripe_123',
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-starter',
            },
          },
        },
      });

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'TRIALING',
      });

      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-starter',
        name: 'Starter',
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        status: 'active',
        current_period_start: 1700000000,
        current_period_end: 1702592000,
      });

      mockPrisma.subscription.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result).toEqual({
        received: true,
        action: 'checkout_session_completed',
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db-1' },
        data: expect.objectContaining({
          planId: 'plan-starter',
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_stripe_123',
        }),
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: null,
          action: 'SUBSCRIPTION_PLAN_CHANGED',
          entityType: 'Subscription',
          entityId: 'sub-db-1',
          metadata: {
            previousPlanId: 'plan-free',
            newPlanId: 'plan-starter',
            stripeSubscriptionId: 'sub_stripe_123',
          },
        },
      });
    });

    it('handles repeated webhook delivery idempotently without creating duplicate audit log', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_123',
            subscription: 'sub_stripe_123',
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-starter',
            },
          },
        },
      });

      // DB subscription already updated to plan-starter
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-starter',
        status: 'ACTIVE',
      });

      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-starter',
        name: 'Starter',
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        status: 'active',
        current_period_start: 1700000000,
        current_period_end: 1702592000,
      });

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result.received).toBe(true);
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('handles customer.subscription.updated event with valid metadata plan ID', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'past_due',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-starter',
            },
          },
        },
      });

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'ACTIVE',
      });

      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-starter',
        name: 'Starter',
      });

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result).toEqual({
        received: true,
        action: 'customer_subscription_updated',
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db-1' },
        data: expect.objectContaining({
          planId: 'plan-starter',
          status: SubscriptionStatus.PAST_DUE,
        }),
      });
    });

    it('falls back to Stripe price mapping when metadata plan ID is nonexistent', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-nonexistent',
            },
            items: {
              data: [
                {
                  price: {
                    id: 'price_starter_test',
                  },
                },
              ],
            },
          },
        },
      });

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'ACTIVE',
      });

      // First call for plan-nonexistent returns null; second call for Starter returns starter plan
      mockPrisma.plan.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'plan-starter', name: 'Starter' });

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result.received).toBe(true);
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db-1' },
        data: expect.objectContaining({
          planId: 'plan-starter',
          status: SubscriptionStatus.ACTIVE,
        }),
      });
    });

    it('retains existing planId when metadata plan ID is nonexistent and price mapping fails', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            status: 'active',
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            metadata: {
              organizationId: 'org-1',
              planId: 'plan-bogus',
            },
            items: {
              data: [
                {
                  price: {
                    id: 'unknown_price_id',
                  },
                },
              ],
            },
          },
        },
      });

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'ACTIVE',
      });

      mockPrisma.plan.findUnique.mockResolvedValue(null);

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result.received).toBe(true);
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db-1' },
        data: expect.objectContaining({
          planId: 'plan-free',
        }),
      });
    });

    it('handles customer.subscription.deleted event by setting status to CANCELLED', async () => {
      mockStripeWebhooks.constructEvent.mockReturnValue({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
          },
        },
      });

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-db-1',
        organizationId: 'org-1',
        planId: 'plan-starter',
        status: 'ACTIVE',
      });

      const result = await handleWebhookEvent(Buffer.from('raw'), 'valid_sig');

      expect(result).toEqual({
        received: true,
        action: 'customer_subscription_deleted',
      });

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-db-1' },
        data: {
          status: SubscriptionStatus.CANCELLED,
        },
      });
    });
  });
});
