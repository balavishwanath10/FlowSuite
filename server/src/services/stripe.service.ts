import Stripe from 'stripe';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../config/db';
import { config } from '../config/env';

export const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion: '2025-02-24.acacia' as any,
});

export const mapStripeStatusToPrisma = (status: string): SubscriptionStatus => {
  switch (status) {
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    case 'canceled':
      return SubscriptionStatus.CANCELLED;
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return SubscriptionStatus.EXPIRED;
    default:
      return SubscriptionStatus.ACTIVE;
  }
};

export const getStripePriceIdForPlan = (planName: string): string | null => {
  if (planName === 'Starter') {
    return config.stripeStarterPriceId || null;
  }
  if (planName === 'Professional') {
    return config.stripeProfessionalPriceId || null;
  }
  return null;
};

export const getPlanNameForStripePriceId = (priceId: string): string | null => {
  if (priceId && priceId === config.stripeStarterPriceId) {
    return 'Starter';
  }
  if (priceId && priceId === config.stripeProfessionalPriceId) {
    return 'Professional';
  }
  return null;
};

export const getOrCreateStripeCustomer = async ({
  organizationId,
}: {
  organizationId: string;
}): Promise<string> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription) {
    throw new Error('Organization subscription not found');
  }

  if (subscription.stripeCustomerId) {
    return subscription.stripeCustomerId;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  const customer = await stripe.customers.create({
    name: organization.name,
    metadata: {
      organizationId,
    },
  });

  await prisma.subscription.update({
    where: { organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

export const createCheckoutSession = async ({
  organizationId,
  planId,
}: {
  organizationId: string;
  planId: string;
}): Promise<{ sessionId: string; url: string | null }> => {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error('Plan not found');
  }

  if (plan.name === 'Free' || plan.priceInPaise === 0) {
    throw new Error('Free plan cannot be purchased via Stripe checkout');
  }

  const priceId = getStripePriceIdForPlan(plan.name);

  if (!priceId) {
    throw new Error('Stripe price not configured for this plan');
  }

  const stripeCustomerId = await getOrCreateStripeCustomer({ organizationId });

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${config.clientUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.clientUrl}/billing`,
    metadata: {
      organizationId,
      planId: plan.id,
    },
    subscription_data: {
      metadata: {
        organizationId,
        planId: plan.id,
      },
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
};

export const handleWebhookEvent = async (
  rawBody: Buffer | string,
  signature: string,
): Promise<{ received: boolean; action?: string }> => {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripeWebhookSecret,
    );
  } catch (err: any) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      const planId = session.metadata?.planId;
      const stripeCustomerId =
        (typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id) || null;
      const stripeSubscriptionId =
        (typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id) || null;

      let dbSub = null;

      if (organizationId) {
        dbSub = await prisma.subscription.findUnique({
          where: { organizationId },
        });
      } else if (stripeSubscriptionId) {
        dbSub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
        });
      } else if (stripeCustomerId) {
        dbSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId },
        });
      }

      if (!dbSub) {
        break;
      }

      const previousPlanId = dbSub.planId;
      let targetPlanId = dbSub.planId;
      if (planId) {
        const metadataPlan = await prisma.plan.findUnique({
          where: { id: planId },
        });
        if (metadataPlan) {
          targetPlanId = metadataPlan.id;
        }
      }

      let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
      let currentPeriodStart: Date | null = null;
      let currentPeriodEnd: Date | null = null;

      if (stripeSubscriptionId) {
        try {
          const stripeSub: any = await stripe.subscriptions.retrieve(
            stripeSubscriptionId,
          );
          status = mapStripeStatusToPrisma(stripeSub.status);
          if (stripeSub.current_period_start) {
            currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
          }
          if (stripeSub.current_period_end) {
            currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
          }
        } catch {
          // Fallback if Stripe sub retrieve fails in mock mode
        }
      }

      await prisma.subscription.update({
        where: { id: dbSub.id },
        data: {
          planId: targetPlanId,
          status,
          ...(stripeCustomerId ? { stripeCustomerId } : {}),
          ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
          ...(currentPeriodStart ? { currentPeriodStart } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });

      if (previousPlanId !== targetPlanId) {
        await prisma.auditLog.create({
          data: {
            organizationId: dbSub.organizationId,
            actorId: null,
            action: 'SUBSCRIPTION_PLAN_CHANGED',
            entityType: 'Subscription',
            entityId: dbSub.id,
            metadata: {
              previousPlanId,
              newPlanId: targetPlanId,
              stripeSubscriptionId,
            },
          },
        });
      }

      return { received: true, action: 'checkout_session_completed' };
    }

    case 'customer.subscription.updated': {
      const stripeSub: any = event.data.object;
      const stripeSubId = stripeSub.id;
      const stripeCustId =
        typeof stripeSub.customer === 'string'
          ? stripeSub.customer
          : stripeSub.customer?.id;

      let dbSub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubId },
      });

      if (!dbSub && stripeCustId) {
        dbSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: stripeCustId },
        });
      }

      if (!dbSub && stripeSub.metadata?.organizationId) {
        dbSub = await prisma.subscription.findUnique({
          where: { organizationId: stripeSub.metadata.organizationId },
        });
      }

      if (!dbSub) {
        break;
      }

      let targetPlanId = dbSub.planId;
      if (stripeSub.metadata?.planId) {
        const metadataPlan = await prisma.plan.findUnique({
          where: { id: stripeSub.metadata.planId },
        });
        if (metadataPlan) {
          targetPlanId = metadataPlan.id;
        }
      }

      if (targetPlanId === dbSub.planId && stripeSub.items?.data?.[0]?.price?.id) {
        const priceId = stripeSub.items.data[0].price.id;
        const planName = getPlanNameForStripePriceId(priceId);

        if (planName) {
          const planRecord = await prisma.plan.findUnique({
            where: { name: planName },
          });
          if (planRecord) {
            targetPlanId = planRecord.id;
          }
        }
      }

      const previousPlanId = dbSub.planId;
      const status = mapStripeStatusToPrisma(stripeSub.status);
      const currentPeriodStart = stripeSub.current_period_start
        ? new Date(stripeSub.current_period_start * 1000)
        : null;
      const currentPeriodEnd = stripeSub.current_period_end
        ? new Date(stripeSub.current_period_end * 1000)
        : null;

      await prisma.subscription.update({
        where: { id: dbSub.id },
        data: {
          planId: targetPlanId,
          status,
          stripeSubscriptionId: stripeSubId,
          stripeCustomerId: stripeCustId || dbSub.stripeCustomerId,
          ...(currentPeriodStart ? { currentPeriodStart } : {}),
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        },
      });

      if (previousPlanId !== targetPlanId) {
        await prisma.auditLog.create({
          data: {
            organizationId: dbSub.organizationId,
            actorId: null,
            action: 'SUBSCRIPTION_PLAN_CHANGED',
            entityType: 'Subscription',
            entityId: dbSub.id,
            metadata: {
              previousPlanId,
              newPlanId: targetPlanId,
              stripeSubscriptionId: stripeSubId,
            },
          },
        });
      }

      return { received: true, action: 'customer_subscription_updated' };
    }

    case 'customer.subscription.deleted': {
      const stripeSub: any = event.data.object;
      const stripeSubId = stripeSub.id;
      const stripeCustId =
        typeof stripeSub.customer === 'string'
          ? stripeSub.customer
          : stripeSub.customer?.id;

      let dbSub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubId },
      });

      if (!dbSub && stripeCustId) {
        dbSub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: stripeCustId },
        });
      }

      if (!dbSub) {
        break;
      }

      await prisma.subscription.update({
        where: { id: dbSub.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
        },
      });

      return { received: true, action: 'customer_subscription_deleted' };
    }

    default:
      break;
  }

  return { received: true };
};
