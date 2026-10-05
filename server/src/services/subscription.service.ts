import { prisma } from '../config/db';

export type PlanEntitlement = {
  id: string;
  name: string;
  priceInPaise: number;
  seatLimit: number;
  projectLimit: number | null;
  apiRequestLimit: number;
  advancedAnalytics: boolean;
};

export type OrganizationSubscriptionResult = {
  id: string;
  organizationId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plan: PlanEntitlement;
};

export const getOrganizationSubscription = async ({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrganizationSubscriptionResult> => {
  const subscription = await prisma.subscription.findUnique({
    where: {
      organizationId,
    },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    throw new Error('Organization subscription not found');
  }

  if (!subscription.plan) {
    throw new Error('Subscription plan not found');
  }

  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      priceInPaise: subscription.plan.priceInPaise,
      seatLimit: subscription.plan.seatLimit,
      projectLimit: subscription.plan.projectLimit,
      apiRequestLimit: subscription.plan.apiRequestLimit,
      advancedAnalytics: subscription.plan.advancedAnalytics,
    },
  };
};

export const checkSeatLimit = (
  plan: { seatLimit: number },
  currentOrRequestedSeatCount: number,
): boolean => {
  return currentOrRequestedSeatCount <= plan.seatLimit;
};

export const checkProjectLimit = (
  plan: { projectLimit: number | null },
  currentOrRequestedProjectCount: number,
): boolean => {
  if (plan.projectLimit === null) {
    return true; // Unlimited projects
  }
  return currentOrRequestedProjectCount <= plan.projectLimit;
};

export const hasAdvancedAnalytics = (plan: {
  advancedAnalytics: boolean;
}): boolean => {
  return plan.advancedAnalytics;
};

export const getApiRequestLimit = (plan: {
  apiRequestLimit: number;
}): number => {
  return plan.apiRequestLimit;
};
