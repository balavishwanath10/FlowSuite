import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

import {
  checkProjectLimit,
  checkSeatLimit,
  getApiRequestLimit,
  getOrganizationSubscription,
  hasAdvancedAnalytics,
} from '../subscription.service';

describe('Subscription Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const freePlan = {
    id: 'plan-free',
    name: 'Free',
    priceInPaise: 0,
    seatLimit: 3,
    projectLimit: 2,
    apiRequestLimit: 1000,
    advancedAnalytics: false,
  };

  const starterPlan = {
    id: 'plan-starter',
    name: 'Starter',
    priceInPaise: 49900,
    seatLimit: 10,
    projectLimit: 20,
    apiRequestLimit: 10000,
    advancedAnalytics: false,
  };

  const professionalPlan = {
    id: 'plan-pro',
    name: 'Professional',
    priceInPaise: 99900,
    seatLimit: 50,
    projectLimit: null,
    apiRequestLimit: 100000,
    advancedAnalytics: true,
  };

  describe('getOrganizationSubscription', () => {
    it('retrieves Free subscription + exact plan entitlements', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'ACTIVE',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodStart: new Date('2026-10-01'),
        currentPeriodEnd: new Date('2026-11-01'),
        createdAt: new Date('2026-10-01'),
        updatedAt: new Date('2026-10-01'),
        plan: freePlan,
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSub);

      const result = await getOrganizationSubscription({
        organizationId: 'org-1',
      });

      expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        include: { plan: true },
      });

      expect(result).toEqual({
        id: 'sub-1',
        organizationId: 'org-1',
        planId: 'plan-free',
        status: 'ACTIVE',
        currentPeriodStart: mockSub.currentPeriodStart,
        currentPeriodEnd: mockSub.currentPeriodEnd,
        createdAt: mockSub.createdAt,
        updatedAt: mockSub.updatedAt,
        plan: freePlan,
      });
    });

    it('retrieves Starter subscription + exact plan entitlements', async () => {
      const mockSub = {
        id: 'sub-2',
        organizationId: 'org-2',
        planId: 'plan-starter',
        status: 'ACTIVE',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: starterPlan,
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSub);

      const result = await getOrganizationSubscription({
        organizationId: 'org-2',
      });

      expect(result.plan).toEqual(starterPlan);
    });

    it('retrieves Professional subscription + exact plan entitlements', async () => {
      const mockSub = {
        id: 'sub-3',
        organizationId: 'org-3',
        planId: 'plan-pro',
        status: 'ACTIVE',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: professionalPlan,
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(mockSub);

      const result = await getOrganizationSubscription({
        organizationId: 'org-3',
      });

      expect(result.plan).toEqual(professionalPlan);
      expect(result.plan.projectLimit).toBeNull();
    });

    it('strictly scopes query by organizationId and prevents cross-tenant leaks', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(
        getOrganizationSubscription({ organizationId: 'org-A' }),
      ).rejects.toThrow('Organization subscription not found');

      expect(mockPrisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-A' },
        include: { plan: true },
      });
    });

    it('throws expected error if subscription is missing', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(
        getOrganizationSubscription({ organizationId: 'non-existent-org' }),
      ).rejects.toThrow('Organization subscription not found');
    });

    it('throws expected error if related plan is missing', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-orphan',
        organizationId: 'org-orphan',
        planId: 'plan-unknown',
        status: 'ACTIVE',
        plan: null,
      });

      await expect(
        getOrganizationSubscription({ organizationId: 'org-orphan' }),
      ).rejects.toThrow('Subscription plan not found');
    });
  });

  describe('Entitlement Helpers', () => {
    describe('checkSeatLimit', () => {
      it('enforces Free seat limit boundary (3 seats allowed, 4 seats rejected)', () => {
        expect(checkSeatLimit(freePlan, 3)).toBe(true);
        expect(checkSeatLimit(freePlan, 4)).toBe(false);
      });

      it('enforces Starter seat limit boundary (10 seats allowed, 11 seats rejected)', () => {
        expect(checkSeatLimit(starterPlan, 10)).toBe(true);
        expect(checkSeatLimit(starterPlan, 11)).toBe(false);
      });

      it('enforces Professional seat limit boundary (50 seats allowed, 51 seats rejected)', () => {
        expect(checkSeatLimit(professionalPlan, 50)).toBe(true);
        expect(checkSeatLimit(professionalPlan, 51)).toBe(false);
      });
    });

    describe('checkProjectLimit', () => {
      it('enforces Free project limit boundary (2 projects allowed, 3 projects rejected)', () => {
        expect(checkProjectLimit(freePlan, 2)).toBe(true);
        expect(checkProjectLimit(freePlan, 3)).toBe(false);
      });

      it('enforces Starter project limit boundary (20 projects allowed, 21 projects rejected)', () => {
        expect(checkProjectLimit(starterPlan, 20)).toBe(true);
        expect(checkProjectLimit(starterPlan, 21)).toBe(false);
      });

      it('treats Professional projectLimit === null as unlimited projects', () => {
        expect(checkProjectLimit(professionalPlan, 0)).toBe(true);
        expect(checkProjectLimit(professionalPlan, 50)).toBe(true);
        expect(checkProjectLimit(professionalPlan, 1000)).toBe(true);
      });
    });

    describe('hasAdvancedAnalytics', () => {
      it('returns false for Free plan', () => {
        expect(hasAdvancedAnalytics(freePlan)).toBe(false);
      });

      it('returns false for Starter plan', () => {
        expect(hasAdvancedAnalytics(starterPlan)).toBe(false);
      });

      it('returns true for Professional plan', () => {
        expect(hasAdvancedAnalytics(professionalPlan)).toBe(true);
      });
    });

    describe('getApiRequestLimit', () => {
      it('returns correct apiRequestLimit values for all plans', () => {
        expect(getApiRequestLimit(freePlan)).toBe(1000);
        expect(getApiRequestLimit(starterPlan)).toBe(10000);
        expect(getApiRequestLimit(professionalPlan)).toBe(100000);
      });
    });
  });
});
