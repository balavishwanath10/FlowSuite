import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextFunction, Response } from 'express';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    membership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

import { requireRole } from '../rbac.middleware';
import { AuthenticatedRequest } from '../auth.middleware';

describe('RBAC Middleware', () => {
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
    const middleware = requireRole('OWNER', 'ADMIN');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user has no organization membership', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue(null);
    const middleware = requireRole('OWNER', 'ADMIN');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: 'org-1',
          userId: 'user-1',
        },
      },
      select: {
        role: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'ORGANIZATION_MEMBERSHIP_REQUIRED',
      message: 'Organization membership required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user role is insufficient for invitation endpoint (MANAGER / MEMBER)', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
    const middleware = requireRole('OWNER', 'ADMIN');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to perform this action',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if ADMIN tries to access OWNER-only endpoint (role change or member removal)', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const middleware = requireRole('OWNER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to perform this action',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if MEMBER tries to create/update/archive projects', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    const middleware = requireRole('OWNER', 'ADMIN', 'MANAGER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to perform this action',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if MANAGER creates/updates/archives projects', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
    const middleware = requireRole('OWNER', 'ADMIN', 'MANAGER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() if MEMBER reads/lists projects', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    const middleware = requireRole('OWNER', 'ADMIN', 'MANAGER', 'MEMBER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() if OWNER accesses OWNER-only endpoint', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'OWNER' });
    const middleware = requireRole('OWNER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() if ADMIN accesses invitation endpoint', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'ADMIN' });
    const middleware = requireRole('OWNER', 'ADMIN');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 if MANAGER tries to access general task update endpoint (OWNER / ADMIN required)', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
    const middleware = requireRole('OWNER', 'ADMIN');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INSUFFICIENT_ROLE',
      message: 'You do not have permission to perform this action',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if MANAGER creates tasks or assigns tasks', async () => {
    mockPrisma.membership.findUnique.mockResolvedValue({ role: 'MANAGER' });
    const middleware = requireRole('OWNER', 'ADMIN', 'MANAGER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 500 if database query throws error', async () => {
    mockPrisma.membership.findUnique.mockRejectedValue(new Error('DB Error'));
    const middleware = requireRole('OWNER');

    await middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 'AUTHORIZATION_CHECK_FAILED',
      message: 'Unable to verify organization permissions',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
