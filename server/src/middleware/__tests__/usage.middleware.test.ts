import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Response } from 'express';

const { mockIncrementApiRequestUsage } = vi.hoisted(() => ({
  mockIncrementApiRequestUsage: vi.fn(),
}));

vi.mock('../../services/usage.service', () => ({
  incrementApiRequestUsage: mockIncrementApiRequestUsage,
}));

import { enforceApiUsageLimit } from '../usage.middleware';
import { AuthenticatedRequest } from '../auth.middleware';

describe('Usage Middleware', () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      user: {
        userId: 'user-1',
        organizationId: 'org-1',
      },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('returns 401 if req.user is undefined', async () => {
    req.user = undefined;

    await enforceApiUsageLimit(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when organization is within API request limit', async () => {
    mockIncrementApiRequestUsage.mockResolvedValue({
      organizationId: 'org-1',
      apiRequests: 5,
      apiRequestLimit: 1000,
      periodStart: new Date(),
      periodEnd: new Date(),
    });

    await enforceApiUsageLimit(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(mockIncrementApiRequestUsage).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns HTTP 429 API_REQUEST_LIMIT_EXCEEDED when request limit is exhausted', async () => {
    mockIncrementApiRequestUsage.mockRejectedValue(
      new Error('API_REQUEST_LIMIT_EXCEEDED'),
    );

    await enforceApiUsageLimit(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      code: 'API_REQUEST_LIMIT_EXCEEDED',
      message: 'API request limit exceeded',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns HTTP 500 API_USAGE_CHECK_FAILED when unexpected error occurs', async () => {
    mockIncrementApiRequestUsage.mockRejectedValue(new Error('Database error'));

    await enforceApiUsageLimit(
      req as AuthenticatedRequest,
      res as Response,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 'API_USAGE_CHECK_FAILED',
      message: 'Unable to verify API request usage limit',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
