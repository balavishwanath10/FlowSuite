import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Request, Response } from 'express';
import {
  createCheckoutSession,
  handleWebhookEvent,
} from '../../services/stripe.service';

const {
  mockCreateCheckoutSession,
  mockHandleWebhookEvent,
  mockAuthenticate,
  mockRequireRole,
  mockEnforceApiUsageLimit,
} = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockHandleWebhookEvent: vi.fn(),
  mockAuthenticate: vi.fn(),
  mockRequireRole: vi.fn(),
  mockEnforceApiUsageLimit: vi.fn(),
}));

vi.mock('../../services/stripe.service', () => ({
  createCheckoutSession: mockCreateCheckoutSession,
  handleWebhookEvent: mockHandleWebhookEvent,
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

import billingRoutes from '../billing.routes';

describe('Billing Routes', () => {
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
      },
      body: {},
      headers: {},
    };

    res = {
      status: statusMock as any,
      json: jsonMock as any,
    };
  });

  const getHandler = (path: string, method: 'post') => {
    const route: any = billingRoutes.stack.find(
      (layer: any) => layer.route && layer.route.path === path && layer.route.methods[method],
    );
    if (!route || !route.route) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found on billingRoutes`);
    }
    return route.route.stack[route.route.stack.length - 1].handle;
  };

  describe('POST /checkout', () => {
    it('creates a checkout session for an OWNER with valid planId', async () => {
      req.body = { planId: 'plan-starter' };

      mockCreateCheckoutSession.mockResolvedValue({
        sessionId: 'cs_test_999',
        url: 'https://checkout.stripe.com/pay/cs_test_999',
      });

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'CHECKOUT_SESSION_CREATED',
        sessionId: 'cs_test_999',
        url: 'https://checkout.stripe.com/pay/cs_test_999',
      });

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        organizationId: 'org-1',
        planId: 'plan-starter',
      });
    });

    it('strictly enforces organizationId from req.user and ignores client-supplied tenant IDs', async () => {
      req.body = {
        planId: 'plan-starter',
        organizationId: 'malicious-org-id',
      };

      mockCreateCheckoutSession.mockResolvedValue({
        sessionId: 'cs_test_888',
        url: 'https://checkout.stripe.com/pay/cs_test_888',
      });

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(mockCreateCheckoutSession).toHaveBeenCalledWith({
        organizationId: 'org-1',
        planId: 'plan-starter',
      });
    });

    it('returns 400 VALIDATION_ERROR if planId is missing from request body', async () => {
      req.body = {};

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
        }),
      );
      expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    });

    it('returns 404 PLAN_NOT_FOUND if requested plan does not exist', async () => {
      req.body = { planId: 'plan-nonexistent' };
      mockCreateCheckoutSession.mockRejectedValue(new Error('Plan not found'));

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'PLAN_NOT_FOUND',
        message: 'Plan not found',
      });
    });

    it('returns 400 FREE_PLAN_CANNOT_BE_PURCHASED if requested plan is Free', async () => {
      req.body = { planId: 'plan-free' };
      mockCreateCheckoutSession.mockRejectedValue(
        new Error('Free plan cannot be purchased via Stripe checkout'),
      );

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'FREE_PLAN_CANNOT_BE_PURCHASED',
        message: 'Free plan does not require Stripe checkout',
      });
    });

    it('returns 400 STRIPE_PRICE_NOT_CONFIGURED if plan has no Stripe price ID mapping', async () => {
      req.body = { planId: 'plan-unconfigured' };
      mockCreateCheckoutSession.mockRejectedValue(
        new Error('Stripe price not configured for this plan'),
      );

      const handler = getHandler('/checkout', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'STRIPE_PRICE_NOT_CONFIGURED',
        message: 'Stripe price not configured for this plan',
      });
    });
  });

  describe('POST /webhook', () => {
    it('returns 400 MISSING_SIGNATURE if stripe-signature header is omitted', async () => {
      req.headers = {};
      req.body = Buffer.from('{}');

      const handler = getHandler('/webhook', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'MISSING_SIGNATURE',
        message: 'Missing stripe-signature header',
      });
      expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
    });

    it('returns 400 MISSING_BODY if raw body is missing', async () => {
      req.headers = { 'stripe-signature': 't=123,v1=sig' };
      req.body = undefined;

      const handler = getHandler('/webhook', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'MISSING_BODY',
        message: 'Raw request body is required',
      });
      expect(mockHandleWebhookEvent).not.toHaveBeenCalled();
    });

    it('processes webhook event successfully with raw body and stripe-signature', async () => {
      req.headers = { 'stripe-signature': 't=123,v1=signature_hash' };
      const rawBuffer = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      req.body = rawBuffer;

      mockHandleWebhookEvent.mockResolvedValue({
        received: true,
        action: 'checkout_session_completed',
      });

      const handler = getHandler('/webhook', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        received: true,
        action: 'checkout_session_completed',
      });

      expect(mockHandleWebhookEvent).toHaveBeenCalledWith(
        rawBuffer,
        't=123,v1=signature_hash',
      );
    });

    it('returns 400 WEBHOOK_ERROR if signature verification fails in handleWebhookEvent', async () => {
      req.headers = { 'stripe-signature': 'invalid_sig' };
      req.body = Buffer.from('{}');

      mockHandleWebhookEvent.mockRejectedValue(
        new Error('Webhook signature verification failed: Invalid signature'),
      );

      const handler = getHandler('/webhook', 'post');
      await handler(req as Request, res as Response, dummyNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'WEBHOOK_ERROR',
        message: 'Webhook signature verification failed: Invalid signature',
      });
    });
  });
});
