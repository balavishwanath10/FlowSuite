import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockGetOrganizationSubscription } = vi.hoisted(() => ({
  mockPrisma: {
    usageCounter: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockGetOrganizationSubscription: vi.fn(),
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../subscription.service', () => ({
  getOrganizationSubscription: mockGetOrganizationSubscription,
}));

import {
  checkApiRequestLimit,
  getOrganizationUsage,
  incrementApiRequestUsage,
} from '../usage.service';

describe('Usage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  const freeSubscription = {
    id: 'sub-1',
    organizationId: 'org-free',
    planId: 'plan-free',
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-10-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: {
      id: 'plan-free',
      name: 'Free',
      priceInPaise: 0,
      seatLimit: 3,
      projectLimit: 2,
      apiRequestLimit: 1000,
      advancedAnalytics: false,
    },
  };

  const starterSubscription = {
    ...freeSubscription,
    organizationId: 'org-starter',
    plan: {
      id: 'plan-starter',
      name: 'Starter',
      priceInPaise: 49900,
      seatLimit: 10,
      projectLimit: 20,
      apiRequestLimit: 10000,
      advancedAnalytics: false,
    },
  };

  const proSubscription = {
    ...freeSubscription,
    organizationId: 'org-pro',
    plan: {
      id: 'plan-pro',
      name: 'Professional',
      priceInPaise: 99900,
      seatLimit: 50,
      projectLimit: null,
      apiRequestLimit: 100000,
      advancedAnalytics: true,
    },
  };

  describe('checkApiRequestLimit', () => {
    it('Free plan limit boundary (999 allowed, 1000 rejected)', () => {
      expect(checkApiRequestLimit(999, 1000)).toBe(true);
      expect(checkApiRequestLimit(1000, 1000)).toBe(false);
      expect(checkApiRequestLimit(1001, 1000)).toBe(false);
    });

    it('Starter plan limit boundary (9999 allowed, 10000 rejected)', () => {
      expect(checkApiRequestLimit(9999, 10000)).toBe(true);
      expect(checkApiRequestLimit(10000, 10000)).toBe(false);
    });

    it('Professional plan limit boundary (99999 allowed, 100000 rejected)', () => {
      expect(checkApiRequestLimit(99999, 100000)).toBe(true);
      expect(checkApiRequestLimit(100000, 100000)).toBe(false);
    });
  });

  describe('getOrganizationUsage', () => {
    it('initializes a new counter with 0 requests if none exists', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(freeSubscription);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(null);

      const createdCounter = {
        id: 'counter-1',
        organizationId: 'org-free',
        apiRequests: 0,
        periodStart: freeSubscription.currentPeriodStart,
        periodEnd: freeSubscription.currentPeriodEnd,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.usageCounter.create.mockResolvedValue(createdCounter);

      const usage = await getOrganizationUsage({ organizationId: 'org-free' });

      expect(mockGetOrganizationSubscription).toHaveBeenCalledWith({
        organizationId: 'org-free',
      });
      expect(mockPrisma.usageCounter.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-free' },
      });
      expect(mockPrisma.usageCounter.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-free',
          apiRequests: 0,
          periodStart: freeSubscription.currentPeriodStart,
          periodEnd: freeSubscription.currentPeriodEnd,
        },
      });

      expect(usage).toEqual({
        organizationId: 'org-free',
        apiRequests: 0,
        apiRequestLimit: 1000,
        periodStart: freeSubscription.currentPeriodStart,
        periodEnd: freeSubscription.currentPeriodEnd,
      });
    });

    it('returns existing counter if current period is active', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(freeSubscription);
      const existingCounter = {
        id: 'counter-1',
        organizationId: 'org-free',
        apiRequests: 42,
        periodStart: new Date('2026-10-01'),
        periodEnd: new Date('2099-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.usageCounter.findUnique.mockResolvedValue(existingCounter);

      const usage = await getOrganizationUsage({ organizationId: 'org-free' });

      expect(mockPrisma.usageCounter.create).not.toHaveBeenCalled();
      expect(mockPrisma.usageCounter.update).not.toHaveBeenCalled();
      expect(usage.apiRequests).toBe(42);
      expect(usage.apiRequestLimit).toBe(1000);
    });

    it('resets usage to zero on lazy period rollover when expired', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(starterSubscription);

      const expiredCounter = {
        id: 'counter-2',
        organizationId: 'org-starter',
        apiRequests: 9500,
        periodStart: new Date('2020-01-01'),
        periodEnd: new Date('2020-02-01'),
      };
      mockPrisma.usageCounter.findUnique.mockResolvedValue(expiredCounter);

      const updatedCounter = {
        ...expiredCounter,
        apiRequests: 0,
        periodStart: starterSubscription.currentPeriodStart,
        periodEnd: starterSubscription.currentPeriodEnd,
      };
      mockPrisma.usageCounter.update.mockResolvedValue(updatedCounter);

      const usage = await getOrganizationUsage({ organizationId: 'org-starter' });

      expect(mockPrisma.usageCounter.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-starter' },
        data: {
          apiRequests: 0,
          periodStart: starterSubscription.currentPeriodStart,
          periodEnd: starterSubscription.currentPeriodEnd,
        },
      });
      expect(usage.apiRequests).toBe(0);
      expect(usage.apiRequestLimit).toBe(10000);
    });

    it('enforces strict organizationId scoping', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(proSubscription);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(null);
      mockPrisma.usageCounter.create.mockResolvedValue({
        organizationId: 'org-pro',
        apiRequests: 0,
        periodStart: proSubscription.currentPeriodStart,
        periodEnd: proSubscription.currentPeriodEnd,
      });

      await getOrganizationUsage({ organizationId: 'org-pro' });

      expect(mockPrisma.usageCounter.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-pro' },
      });
      expect(mockPrisma.usageCounter.findUnique).not.toHaveBeenCalledWith({
        where: { organizationId: 'org-other' },
      });
    });
  });

  describe('incrementApiRequestUsage', () => {
    it('increments usage when below limit and returns updated result', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(freeSubscription);

      const activeCounter = {
        id: 'counter-1',
        organizationId: 'org-free',
        apiRequests: 15,
        periodStart: freeSubscription.currentPeriodStart,
        periodEnd: new Date('2099-01-01'),
      };
      mockPrisma.usageCounter.findUnique.mockResolvedValue(activeCounter);
      mockPrisma.usageCounter.updateMany.mockResolvedValue({ count: 1 });

      const updatedCounter = {
        ...activeCounter,
        apiRequests: 16,
      };
      // For inside transaction findUnique
      mockPrisma.usageCounter.findUnique
        .mockResolvedValueOnce(activeCounter)
        .mockResolvedValueOnce(updatedCounter);

      const result = await incrementApiRequestUsage({ organizationId: 'org-free' });

      expect(mockPrisma.usageCounter.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-free',
          apiRequests: { lt: 1000 },
        },
        data: {
          apiRequests: { increment: 1 },
        },
      });

      expect(result.apiRequests).toBe(16);
    });

    it('rejects request at limit with API_REQUEST_LIMIT_EXCEEDED error without incrementing', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(freeSubscription);

      const fullCounter = {
        id: 'counter-1',
        organizationId: 'org-free',
        apiRequests: 1000,
        periodStart: freeSubscription.currentPeriodStart,
        periodEnd: new Date('2099-01-01'),
      };
      mockPrisma.usageCounter.findUnique.mockResolvedValue(fullCounter);

      await expect(
        incrementApiRequestUsage({ organizationId: 'org-free' }),
      ).rejects.toThrow('API_REQUEST_LIMIT_EXCEEDED');

      expect(mockPrisma.usageCounter.updateMany).not.toHaveBeenCalled();
    });

    it('rejects concurrent request when limit is reached during updateMany', async () => {
      mockGetOrganizationSubscription.mockResolvedValue(freeSubscription);

      const nearLimitCounter = {
        id: 'counter-1',
        organizationId: 'org-free',
        apiRequests: 999,
        periodStart: freeSubscription.currentPeriodStart,
        periodEnd: new Date('2099-01-01'),
      };
      mockPrisma.usageCounter.findUnique.mockResolvedValue(nearLimitCounter);
      mockPrisma.usageCounter.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        incrementApiRequestUsage({ organizationId: 'org-free' }),
      ).rejects.toThrow('API_REQUEST_LIMIT_EXCEEDED');
    });
  });
});
