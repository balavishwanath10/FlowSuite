import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { incrementApiRequestUsage } from '../services/usage.service';

export const enforceApiUsageLimit = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || !req.user.organizationId) {
    return res.status(401).json({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
  }

  try {
    await incrementApiRequestUsage({
      organizationId: req.user.organizationId,
    });
    return next();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'API usage check failed';

    if (message === 'API_REQUEST_LIMIT_EXCEEDED') {
      return res.status(429).json({
        code: 'API_REQUEST_LIMIT_EXCEEDED',
        message: 'API request limit exceeded',
      });
    }

    return res.status(500).json({
      code: 'API_USAGE_CHECK_FAILED',
      message: 'Unable to verify API request usage limit',
    });
  }
};
