import { Response, Router } from 'express';
import { prisma } from '../config/db';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { enforceApiUsageLimit } from '../middleware/usage.middleware';
import { getOrganizationSubscription } from '../services/subscription.service';

const router = Router();

router.get(
  '/plans',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const rawPlans = await prisma.plan.findMany({
        orderBy: { priceInPaise: 'asc' },
      });

      const plans = rawPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        priceInPaise: plan.priceInPaise,
        seatLimit: plan.seatLimit,
        projectLimit: plan.projectLimit,
        apiRequestLimit: plan.apiRequestLimit,
        advancedAnalytics: plan.advancedAnalytics,
      }));

      return res.status(200).json({
        code: 'PLANS_RETRIEVED',
        plans,
      });
    } catch {
      return res.status(500).json({
        code: 'PLANS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve subscription plans',
      });
    }
  },
);

router.get(
  '/',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const subscription = await getOrganizationSubscription({
        organizationId: req.user.organizationId,
      });

      return res.status(200).json({
        code: 'SUBSCRIPTION_RETRIEVED',
        subscription,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to retrieve subscription';

      if (
        message === 'Organization subscription not found' ||
        message === 'Subscription plan not found'
      ) {
        return res.status(404).json({
          code: 'SUBSCRIPTION_NOT_FOUND',
          message,
        });
      }

      return res.status(500).json({
        code: 'SUBSCRIPTION_RETRIEVAL_FAILED',
        message: 'Unable to retrieve subscription',
      });
    }
  },
);

export default router;
