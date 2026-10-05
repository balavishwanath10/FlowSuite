import { Request, Response, Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { enforceApiUsageLimit } from '../middleware/usage.middleware';
import {
  acceptInvitation,
  inviteOrganizationMember,
  listOrganizationMembers,
  removeOrganizationMember,
  updateMemberRole,
} from '../services/membership.service';

const router = Router();

const membershipIdSchema = z.object({
  membershipId: z.string().uuid(),
});

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).default('MEMBER'),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(8).max(128).optional(),
});

const updateRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']),
});

router.get(
  '/',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER'),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const members = await listOrganizationMembers({
        organizationId: req.user.organizationId,
      });

      return res.status(200).json({
        code: 'MEMBERS_RETRIEVED',
        members,
      });
    } catch {
      return res.status(500).json({
        code: 'MEMBERS_RETRIEVAL_FAILED',
        message: 'Unable to retrieve organization members',
      });
    }
  },
);

router.post(
  '/invite',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER', 'ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    const validation = inviteSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid invitation data',
        errors: validation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const result = await inviteOrganizationMember({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        email: validation.data.email,
        role: validation.data.role,
      });

      return res.status(201).json({
        code: 'MEMBER_INVITED',
        message: 'Member invited successfully',
        invitation: result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to invite member';

      return res.status(400).json({
        code: 'MEMBER_INVITATION_FAILED',
        message,
      });
    }
  },
);

router.post('/accept-invite', async (req: Request, res: Response) => {
  const validation = acceptInviteSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid invitation acceptance data',
      errors: validation.error.flatten(),
    });
  }

  try {
    const membership = await acceptInvitation(validation.data);

    return res.status(200).json({
      code: 'INVITATION_ACCEPTED',
      message: 'Invitation accepted successfully',
      membership,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to accept invitation';

    return res.status(400).json({
      code: 'INVITATION_ACCEPTANCE_FAILED',
      message,
    });
  }
});

router.patch(
  '/role',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const validation = updateRoleSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid membership role update data',
        errors: validation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const membership = await updateMemberRole({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        membershipId: validation.data.membershipId,
        role: validation.data.role,
      });

      return res.status(200).json({
        code: 'MEMBER_ROLE_UPDATED',
        membership,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update member role';

      return res.status(400).json({
        code: 'MEMBER_ROLE_UPDATE_FAILED',
        message,
      });
    }
  },
);

router.delete(
  '/:membershipId',
  authenticate,
  enforceApiUsageLimit,
  requireRole('OWNER'),
  async (req: AuthenticatedRequest, res: Response) => {
    const validation = membershipIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Invalid membership ID',
        errors: validation.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const result = await removeOrganizationMember({
        organizationId: req.user.organizationId,
        actorId: req.user.userId,
        membershipId: validation.data.membershipId,
      });

      return res.status(200).json({
        code: 'MEMBER_REMOVED',
        ...result,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to remove organization member';

      return res.status(400).json({
        code: 'MEMBER_REMOVAL_FAILED',
        message,
      });
    }
  },
);

export default router;