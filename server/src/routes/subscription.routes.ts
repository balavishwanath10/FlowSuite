import { Response, Router } from 'express';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { getOrganizationSubscription } from '../services/subscription.service';

const router = Router();

router.get(
  '/',
  authenticate,
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
