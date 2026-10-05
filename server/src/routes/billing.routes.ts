import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware';
import { enforceApiUsageLimit } from '../middleware/usage.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  createCheckoutSession,
  handleWebhookEvent,
} from '../services/stripe.service';

const router = Router();

const createCheckoutSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
});

router.post(
  '/checkout',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = createCheckoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const organizationId = req.user!.organizationId;
      const { planId } = parsed.data;

      const result = await createCheckoutSession({ organizationId, planId });

      return res.status(200).json({
        code: 'CHECKOUT_SESSION_CREATED',
        sessionId: result.sessionId,
        url: result.url,
      });
    } catch (error: any) {
      if (error.message?.includes('Plan not found')) {
        return res.status(404).json({
          code: 'PLAN_NOT_FOUND',
          message: 'Plan not found',
        });
      }
      if (error.message?.includes('Free plan cannot be purchased')) {
        return res.status(400).json({
          code: 'FREE_PLAN_CANNOT_BE_PURCHASED',
          message: 'Free plan does not require Stripe checkout',
        });
      }
      if (error.message?.includes('Stripe price not configured')) {
        return res.status(400).json({
          code: 'STRIPE_PRICE_NOT_CONFIGURED',
          message: 'Stripe price not configured for this plan',
        });
      }

      return res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create checkout session',
      });
    }
  },
);

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      return res.status(400).json({
        code: 'MISSING_SIGNATURE',
        message: 'Missing stripe-signature header',
      });
    }

    if (!req.body) {
      return res.status(400).json({
        code: 'MISSING_BODY',
        message: 'Raw request body is required',
      });
    }

    const result = await handleWebhookEvent(req.body, signature);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({
      code: 'WEBHOOK_ERROR',
      message: error.message || 'Webhook verification failed',
    });
  }
});

export default router;
