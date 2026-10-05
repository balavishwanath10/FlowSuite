import { Response, Router } from 'express';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { getOrganizationUsage } from '../services/usage.service';

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
      const usage = await getOrganizationUsage({
        organizationId: req.user.organizationId,
      });

      return res.status(200).json({
        code: 'USAGE_RETRIEVED',
        usage: {
          organizationId: usage.organizationId,
          apiRequests: usage.apiRequests,
          apiRequestLimit: usage.apiRequestLimit,
          periodStart: usage.periodStart,
          periodEnd: usage.periodEnd,
        },
      });
    } catch {
      return res.status(500).json({
        code: 'USAGE_RETRIEVAL_FAILED',
        message: 'Unable to retrieve organization usage',
      });
    }
  },
);

export default router;
