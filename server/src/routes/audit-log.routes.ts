import { Response, Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { listOrganizationAuditLogs } from '../services/audit-log.service';

const router = Router();

const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).optional(),
  actorId: z.string().uuid().optional(),
});

router.get(
  '/',
  authenticate,
  requireRole('OWNER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    const queryValidation = listAuditLogsQuerySchema.safeParse(req.query);

    if (!queryValidation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        errors: queryValidation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const result = await listOrganizationAuditLogs({
        organizationId: req.user.organizationId,
        page: queryValidation.data.page,
        limit: queryValidation.data.limit,
        action: queryValidation.data.action,
        actorId: queryValidation.data.actorId,
      });

      return res.status(200).json({
        code: 'AUDIT_LOGS_RETRIEVED',
        auditLogs: result.auditLogs,
        pagination: result.pagination,
      });
    } catch {
      return res.status(500).json({
        code: 'AUDIT_LOGS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve audit logs',
      });
    }
  },
);

export default router;
