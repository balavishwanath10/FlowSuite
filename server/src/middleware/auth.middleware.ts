import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../services/auth.service';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    organizationId: string;
  };
  userRole?: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';
}

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
  }

  const token = authorization.substring(7);

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      organizationId: payload.organizationId,
    };

    return next();
  } catch {
    return res.status(401).json({
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Invalid or expired access token',
    });
  }
};