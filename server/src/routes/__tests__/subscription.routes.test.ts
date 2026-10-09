import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Request, Response } from 'express';

const {
  mockPrisma,
  mockGetOrganizationSubscription,
  mockAuthenticate,
  mockRequireRole,
  mockEnforceApiUsageLimit,
} = vi.hoisted(() => ({
  mockPrisma: {
    plan: {
      findMany: vi.fn(),
    },
  },
  mockGetOrganizationSubscription: vi.fn(),
  mockAuthenticate: vi.fn(),
  mockRequireRole: vi.fn(),
  mockEnforceApiUsageLimit: vi.fn(),
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../services/subscription.service', () => ({
  getOrganizationSubscription: mockGetOrganizationSubscription,
}));

vi.mock('../../middleware/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: any) => mockAuthenticate(req, res, next),
}));

vi.mock('../../middleware/usage.middleware', () => ({
  enforceApiUsageLimit: (req: any, res: any, next: any) =>
    mockEnforceApiUsageLimit(req, res, next),
}));

vi.mock('../../middleware/rbac.middleware', () => ({
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    mockRequireRole(roles, req, res, next),
}));

import subscriptionRoutes from '../subscription.routes';

describe('Subscription Routes', () => {
  let req: Partial<Request> & { user?: any };
  let res: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  const dummyNext: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn().mockReturnThis();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    req = {
      user: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      },
      headers: {},
    };

    res = {
      status: statusMock as any,
      json: jsonMock as any,
    };

    mockAuthenticate.mockImplementation((req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required',
        });
      }
      return next();
    });

    mockEnforceApiUsageLimit.mockImplementation((_req: any, _res: any, next: any) => {
      return next();
    });

    mockRequireRole.mockImplementation((allowedRoles: string[], req: any, res: any, next: any) => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          code: 'INSUFFICIENT_ROLE',
          message: 'You do not have permission to perform this action',
        });
      }
      return next();
    });
  });

  const getRouteStack = (path: string, method: 'get') => {
    const routeLayer: any = subscriptionRoutes.stack.find(
      (layer: any) => layer.route && layer.route.path === path && layer.route.methods[method],
    );
    if (!routeLayer || !routeLayer.route) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found on subscriptionRoutes`);
    }
    return routeLayer.route.stack.map((s: any) => s.handle);
  };

  const executeRouteChain = async (path: string, method: 'get', req: any, res: any) => {
    const stack = getRouteStack(path, method);
    let index = 0;
    const next = async (err?: any) => {
      if (err) throw err;
      if (index < stack.length) {
        const handler = stack[index++];
        await handler(req, res, next);
      }
    };
    await next();
  };

  describe('GET /plans', () => {
    const rawPrismaPlans = [
      {
        id: 'plan-free',
        name: 'Free',
        priceInPaise: 0,
        seatLimit: 3,
        projectLimit: 2,
        apiRequestLimit: 1000,
        advancedAnalytics: false,
        stripePriceId: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'plan-starter',
        name: 'Starter',
        priceInPaise: 49900,
        seatLimit: 10,
        projectLimit: 20,
        apiRequestLimit: 10000,
        advancedAnalytics: false,
        stripePriceId: 'price_starter_123',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: 'plan-pro',
        name: 'Professional',
        priceInPaise: 99900,
        seatLimit: 50,
        projectLimit: null,
        apiRequestLimit: 100000,
        advancedAnalytics: true,
        stripePriceId: 'price_pro_456',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ];

    const expectedMappedPlans = [
      {
        id: 'plan-free',
        name: 'Free',
        priceInPaise: 0,
        seatLimit: 3,
        projectLimit: 2,
        apiRequestLimit: 1000,
        advancedAnalytics: false,
      },
      {
        id: 'plan-starter',
        name: 'Starter',
        priceInPaise: 49900,
        seatLimit: 10,
        projectLimit: 20,
        apiRequestLimit: 10000,
        advancedAnalytics: false,
      },
      {
        id: 'plan-pro',
        name: 'Professional',
        priceInPaise: 99900,
        seatLimit: 50,
        projectLimit: null,
        apiRequestLimit: 100000,
        advancedAnalytics: true,
      },
    ];

    it('registers middleware chain in exact order: authenticate -> enforceApiUsageLimit -> requireRole("OWNER", "ADMIN") -> route handler', async () => {
      const stack = getRouteStack('/plans', 'get');
      expect(stack.length).toBe(4);

      mockPrisma.plan.findMany.mockResolvedValue(rawPrismaPlans);

      await executeRouteChain('/plans', 'get', req, res);

      expect(mockAuthenticate).toHaveBeenCalled();
      expect(mockEnforceApiUsageLimit).toHaveBeenCalled();
      expect(mockRequireRole).toHaveBeenCalledWith(
        ['OWNER', 'ADMIN'],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockPrisma.plan.findMany).toHaveBeenCalled();
    });

    it('executes configured middleware chain for OWNER and ADMIN roles and retrieves mapped plans in ascending price order', async () => {
      mockPrisma.plan.findMany.mockResolvedValue(rawPrismaPlans);

      // Test OWNER through chain
      req.user = { userId: 'user-owner', organizationId: 'org-1', role: 'OWNER' };
      await executeRouteChain('/plans', 'get', req, res);

      expect(mockPrisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: { priceInPaise: 'asc' },
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'PLANS_RETRIEVED',
        plans: expectedMappedPlans,
      });

      // Confirm internal fields are stripped
      const returnedPlans = jsonMock.mock.calls[0][0].plans;
      expect(returnedPlans[0].stripePriceId).toBeUndefined();
      expect(returnedPlans[0].createdAt).toBeUndefined();

      // Test ADMIN through chain
      vi.clearAllMocks();
      req.user = { userId: 'user-admin', organizationId: 'org-1', role: 'ADMIN' };
      await executeRouteChain('/plans', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'PLANS_RETRIEVED',
        plans: expectedMappedPlans,
      });
    });

    it('rejects MEMBER role through configured middleware chain and prevents reaching database handler', async () => {
      req.user = { userId: 'user-member', organizationId: 'org-1', role: 'MEMBER' };

      await executeRouteChain('/plans', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'INSUFFICIENT_ROLE',
        message: 'You do not have permission to perform this action',
      });
      expect(mockPrisma.plan.findMany).not.toHaveBeenCalled();
    });

    it('returns 401 AUTHENTICATION_REQUIRED if req.user is missing and does not touch database', async () => {
      req.user = undefined;

      await executeRouteChain('/plans', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
      expect(mockPrisma.plan.findMany).not.toHaveBeenCalled();
    });

    it('returns 500 PLANS_RETRIEVAL_FAILED when database query fails', async () => {
      mockPrisma.plan.findMany.mockRejectedValue(new Error('Database error'));

      await executeRouteChain('/plans', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'PLANS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve subscription plans',
      });
    });
  });

  describe('GET /', () => {
    it('retrieves organization subscription for authenticated user through middleware chain', async () => {
      const mockSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        planId: 'plan-starter',
        status: 'ACTIVE',
        currentPeriodStart: '2026-10-01T00:00:00.000Z',
        currentPeriodEnd: '2026-11-01T00:00:00.000Z',
        plan: {
          id: 'plan-starter',
          name: 'Starter',
          priceInPaise: 49900,
        },
      };

      mockGetOrganizationSubscription.mockResolvedValue(mockSub);

      await executeRouteChain('/', 'get', req, res);

      expect(mockGetOrganizationSubscription).toHaveBeenCalledWith({
        organizationId: 'org-1',
      });
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'SUBSCRIPTION_RETRIEVED',
        subscription: mockSub,
      });
    });

    it('returns 404 SUBSCRIPTION_NOT_FOUND when organization subscription is missing', async () => {
      mockGetOrganizationSubscription.mockRejectedValue(
        new Error('Organization subscription not found'),
      );

      await executeRouteChain('/', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: 'Organization subscription not found',
      });
    });

    it('returns 500 SUBSCRIPTION_RETRIEVAL_FAILED on unexpected errors', async () => {
      mockGetOrganizationSubscription.mockRejectedValue(new Error('Unexpected DB error'));

      await executeRouteChain('/', 'get', req, res);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'SUBSCRIPTION_RETRIEVAL_FAILED',
        message: 'Unable to retrieve subscription',
      });
    });
  });
});
