import { prisma } from '../config/db';
import { getOrganizationSubscription } from './subscription.service';

export type OrganizationUsageResult = {
  organizationId: string;
  apiRequests: number;
  apiRequestLimit: number;
  periodStart: Date;
  periodEnd: Date;
};

const calculatePeriodDates = (
  subCurrentPeriodStart?: Date | null,
  subCurrentPeriodEnd?: Date | null,
) => {
  const now = new Date();
  if (
    subCurrentPeriodStart &&
    subCurrentPeriodEnd &&
    subCurrentPeriodEnd > now
  ) {
    return {
      periodStart: subCurrentPeriodStart,
      periodEnd: subCurrentPeriodEnd,
    };
  }

  const periodStart = new Date(now);
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
};

export const getOrganizationUsage = async ({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrganizationUsageResult> => {
  const subscription = await getOrganizationSubscription({ organizationId });
  const apiRequestLimit = subscription.plan.apiRequestLimit;

  let counter = await prisma.usageCounter.findUnique({
    where: { organizationId },
  });

  const now = new Date();

  if (!counter) {
    const { periodStart, periodEnd } = calculatePeriodDates(
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
    counter = await prisma.usageCounter.create({
      data: {
        organizationId,
        apiRequests: 0,
        periodStart,
        periodEnd,
      },
    });
  } else if (now >= counter.periodEnd) {
    const { periodStart, periodEnd } = calculatePeriodDates(
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
    counter = await prisma.usageCounter.update({
      where: { organizationId },
      data: {
        apiRequests: 0,
        periodStart,
        periodEnd,
      },
    });
  }

  return {
    organizationId: counter.organizationId,
    apiRequests: counter.apiRequests,
    apiRequestLimit,
    periodStart: counter.periodStart,
    periodEnd: counter.periodEnd,
  };
};

export const checkApiRequestLimit = (
  currentUsage: number,
  limit: number,
): boolean => {
  return currentUsage < limit;
};

export const incrementApiRequestUsage = async ({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrganizationUsageResult> => {
  const currentUsage = await getOrganizationUsage({ organizationId });

  if (
    !checkApiRequestLimit(
      currentUsage.apiRequests,
      currentUsage.apiRequestLimit,
    )
  ) {
    throw new Error('API_REQUEST_LIMIT_EXCEEDED');
  }

  return prisma.$transaction(async (tx) => {
    const updateResult = await tx.usageCounter.updateMany({
      where: {
        organizationId,
        apiRequests: { lt: currentUsage.apiRequestLimit },
      },
      data: {
        apiRequests: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new Error('API_REQUEST_LIMIT_EXCEEDED');
    }

    const updatedCounter = await tx.usageCounter.findUnique({
      where: { organizationId },
    });

    return {
      organizationId,
      apiRequests: updatedCounter
        ? updatedCounter.apiRequests
        : currentUsage.apiRequests + 1,
      apiRequestLimit: currentUsage.apiRequestLimit,
      periodStart: updatedCounter
        ? updatedCounter.periodStart
        : currentUsage.periodStart,
      periodEnd: updatedCounter
        ? updatedCounter.periodEnd
        : currentUsage.periodEnd,
    };
  });
};
