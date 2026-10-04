import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

import { listOrganizationAuditLogs } from '../audit-log.service';

describe('Audit Log Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listOrganizationAuditLogs', () => {
    it('lists audit logs for the authenticated organization with default pagination', async () => {
      const mockLogs = [
        {
          id: 'log-2',
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: 'proj-1',
          metadata: { name: 'Project B' },
          createdAt: new Date('2026-10-04T12:00:00Z'),
          actor: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 'log-1',
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'MEMBER_INVITED',
          entityType: 'Membership',
          entityId: 'mem-1',
          metadata: { email: 'bob@example.com' },
          createdAt: new Date('2026-10-04T10:00:00Z'),
          actor: { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
        },
      ];

      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await listOrganizationAuditLogs({
        organizationId: 'org-1',
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      expect(result).toEqual({
        auditLogs: mockLogs,
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('scopes queries strictly by organizationId and prevents cross-tenant access', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(0);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await listOrganizationAuditLogs({
        organizationId: 'org-A',
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-A' },
      });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-A' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: expect.any(Object),
      });

      // Assert org-B is not queried
      expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-B' }),
        }),
      );
    });

    it('applies custom pagination and calculates totalPages correctly', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(45);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const result = await listOrganizationAuditLogs({
        organizationId: 'org-1',
        page: 3,
        limit: 10,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        skip: 20,
        take: 10,
        include: expect.any(Object),
      });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 45,
        totalPages: 5,
      });
    });

    it('filters audit logs by action', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await listOrganizationAuditLogs({
        organizationId: 'org-1',
        action: 'TASK_CREATED',
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          action: 'TASK_CREATED',
        },
      });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          action: 'TASK_CREATED',
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: expect.any(Object),
      });
    });

    it('filters audit logs by actorId', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await listOrganizationAuditLogs({
        organizationId: 'org-1',
        actorId: 'user-55',
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          actorId: 'user-55',
        },
      });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          actorId: 'user-55',
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: expect.any(Object),
      });
    });

    it('filters by both action and actorId simultaneously', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(1);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      await listOrganizationAuditLogs({
        organizationId: 'org-1',
        action: 'CUSTOMER_DELETED',
        actorId: 'user-99',
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          action: 'CUSTOMER_DELETED',
          actorId: 'user-99',
        },
      });
    });

    it('normalizes out-of-bound page and limit values', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(10);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const result = await listOrganizationAuditLogs({
        organizationId: 'org-1',
        page: -5,
        limit: 500,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 100,
        include: expect.any(Object),
      });

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(100);
    });
  });
});
