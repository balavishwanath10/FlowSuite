import { NextFunction, Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from './auth.middleware';

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';

export const requireRole = (...allowedRoles: Role[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (!req.user) {
      return res.status(401).json({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
    }

    try {
      const membership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: req.user.organizationId,
            userId: req.user.userId,
          },
        },
        select: {
          role: true,
        },
      });

      if (!membership) {
        return res.status(403).json({
          code: 'ORGANIZATION_MEMBERSHIP_REQUIRED',
          message: 'Organization membership required',
        });
      }

      if (!allowedRoles.includes(membership.role as Role)) {
        return res.status(403).json({
          code: 'INSUFFICIENT_ROLE',
          message: 'You do not have permission to perform this action',
        });
      }

      req.userRole = membership.role as Role;
      return next();
    } catch {
      return res.status(500).json({
        code: 'AUTHORIZATION_CHECK_FAILED',
        message: 'Unable to verify organization permissions',
      });
    }
  };
};