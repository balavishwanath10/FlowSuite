import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Response } from 'express';

const { mockVerifyAccessToken } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

import { authenticate, AuthenticatedRequest } from '../auth.middleware';

describe('Auth Middleware', () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      headers: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  describe('Missing or invalid Authorization header', () => {
    it('returns HTTP 401 AUTHENTICATION_REQUIRED when Authorization header is omitted', () => {
      req.headers = {};

      authenticate(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns HTTP 401 AUTHENTICATION_REQUIRED when Authorization header does not start with Bearer ', () => {
      req.headers = {
        authorization: 'Basic dXNlcjpwYXNz',
      };

      authenticate(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Valid token authentication', () => {
    it('authenticates user and calls next() when valid Bearer token is provided', () => {
      req.headers = {
        authorization: 'Bearer valid.jwt.token',
      };

      mockVerifyAccessToken.mockReturnValue({
        userId: 'user-123',
        organizationId: 'org-456',
      });

      authenticate(req as AuthenticatedRequest, res as Response, next);

      expect(mockVerifyAccessToken).toHaveBeenCalledWith('valid.jwt.token');
      expect(req.user).toEqual({
        userId: 'user-123',
        organizationId: 'org-456',
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('Invalid or expired token', () => {
    it('returns HTTP 401 INVALID_ACCESS_TOKEN when token verification fails', () => {
      req.headers = {
        authorization: 'Bearer invalid.jwt.token',
      };

      mockVerifyAccessToken.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      authenticate(req as AuthenticatedRequest, res as Response, next);

      expect(mockVerifyAccessToken).toHaveBeenCalledWith('invalid.jwt.token');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Invalid or expired access token',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
