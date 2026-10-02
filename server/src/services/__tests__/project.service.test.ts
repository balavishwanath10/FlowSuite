import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

import {
  archiveProject,
  createProject,
  getProjectById,
  listOrganizationProjects,
  updateProject,
} from '../project.service';

describe('Project Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProject', () => {
    it('creates a new project with ACTIVE status and creates audit log transactionally', async () => {
      const mockProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'New Project',
        description: 'Test description',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.project.create.mockResolvedValue(mockProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await createProject({
        organizationId: 'org-1',
        actorId: 'user-1',
        name: '  New Project  ',
        description: '  Test description  ',
      });

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'New Project',
          description: 'Test description',
          status: 'ACTIVE',
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: 'proj-1',
          metadata: {
            name: 'New Project',
          },
        },
      });
      expect(result).toBe(mockProject);
    });
  });

  describe('listOrganizationProjects', () => {
    it('returns projects scoped strictly by organizationId', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          organizationId: 'org-1',
          name: 'Project 1',
          status: 'ACTIVE',
        },
      ];

      mockPrisma.project.findMany.mockResolvedValue(mockProjects);

      const result = await listOrganizationProjects({
        organizationId: 'org-1',
      });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(mockProjects);
    });

    it('scopes listing query by tasks assigned to user when userRole is MEMBER', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          organizationId: 'org-1',
          name: 'Assigned Project',
          status: 'ACTIVE',
        },
      ];

      mockPrisma.project.findMany.mockResolvedValue(mockProjects);

      const result = await listOrganizationProjects({
        organizationId: 'org-1',
        userId: 'member-1',
        userRole: 'MEMBER',
      });

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          tasks: {
            some: {
              assigneeId: 'member-1',
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(mockProjects);
    });
  });

  describe('getProjectById', () => {
    it('returns project details when found within authenticated organization', async () => {
      const mockProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Project 1',
        status: 'ACTIVE',
      };

      mockPrisma.project.findFirst.mockResolvedValue(mockProject);

      const result = await getProjectById({
        organizationId: 'org-1',
        projectId: 'proj-1',
      });

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'proj-1',
          organizationId: 'org-1',
        },
      });
      expect(result).toBe(mockProject);
    });

    it('scopes single project lookup by tasks assigned to user when userRole is MEMBER', async () => {
      const mockProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Assigned Project',
        status: 'ACTIVE',
      };

      mockPrisma.project.findFirst.mockResolvedValue(mockProject);

      const result = await getProjectById({
        organizationId: 'org-1',
        projectId: 'proj-1',
        userId: 'member-1',
        userRole: 'MEMBER',
      });

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'proj-1',
          organizationId: 'org-1',
          tasks: {
            some: {
              assigneeId: 'member-1',
            },
          },
        },
      });
      expect(result).toBe(mockProject);
    });

    it('rejects with "Project not found" when MEMBER attempts to retrieve a project not associated with any task assigned to that member', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        getProjectById({
          organizationId: 'org-1',
          projectId: 'unassigned-proj',
          userId: 'member-1',
          userRole: 'MEMBER',
        }),
      ).rejects.toThrow('Project not found');

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'unassigned-proj',
          organizationId: 'org-1',
          tasks: {
            some: {
              assigneeId: 'member-1',
            },
          },
        },
      });
    });

    it('rejects with "Project not found" when project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        getProjectById({
          organizationId: 'org-1',
          projectId: 'missing-proj',
        }),
      ).rejects.toThrow('Project not found');
    });

    it('explicit cross-tenant isolation: rejects read attempt when Org A tries to access Org B project', async () => {
      mockPrisma.project.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; organizationId: string } }) => {
          if (
            where.id === 'org-b-proj' &&
            where.organizationId === 'org-a'
          ) {
            return null; // Org B's project is not found under Org A's scope
          }
          return null;
        },
      );

      await expect(
        getProjectById({
          organizationId: 'org-a',
          projectId: 'org-b-proj',
        }),
      ).rejects.toThrow('Project not found');

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'org-b-proj',
          organizationId: 'org-a',
        },
      });
    });
  });

  describe('updateProject', () => {
    it('updates project fields transactionally and creates audit log', async () => {
      const existingProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Old Name',
        description: 'Old Desc',
        status: 'ACTIVE',
      };

      const updatedProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Updated Name',
        description: 'Updated Desc',
        status: 'ACTIVE',
      };

      mockPrisma.project.findFirst.mockResolvedValue(existingProject);
      mockPrisma.project.update.mockResolvedValue(updatedProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await updateProject({
        organizationId: 'org-1',
        actorId: 'user-1',
        projectId: 'proj-1',
        name: 'Updated Name',
        description: 'Updated Desc',
      });

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: {
          name: 'Updated Name',
          description: 'Updated Desc',
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'PROJECT_UPDATED',
          entityType: 'Project',
          entityId: 'proj-1',
          metadata: {
            updatedFields: {
              name: 'Updated Name',
              description: 'Updated Desc',
            },
          },
        },
      });
      expect(result).toBe(updatedProject);
    });

    it('rejects update when project is missing', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        updateProject({
          organizationId: 'org-1',
          actorId: 'user-1',
          projectId: 'missing-proj',
          name: 'New Name',
        }),
      ).rejects.toThrow('Project not found');
    });

    it('explicit cross-tenant isolation: rejects update attempt when Org A tries to modify Org B project', async () => {
      mockPrisma.project.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; organizationId: string } }) => {
          if (
            where.id === 'org-b-proj' &&
            where.organizationId === 'org-a'
          ) {
            return null;
          }
          return null;
        },
      );

      await expect(
        updateProject({
          organizationId: 'org-a',
          actorId: 'user-a',
          projectId: 'org-b-proj',
          name: 'Hacked Name',
        }),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('archiveProject', () => {
    it('archives project by updating status to ARCHIVED with audit log transactionally', async () => {
      const existingProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Active Project',
        status: 'ACTIVE',
      };

      const archivedProject = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Active Project',
        status: 'ARCHIVED',
      };

      mockPrisma.project.findFirst.mockResolvedValue(existingProject);
      mockPrisma.project.update.mockResolvedValue(archivedProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-3' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await archiveProject({
        organizationId: 'org-1',
        actorId: 'user-1',
        projectId: 'proj-1',
      });

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-1' },
        data: { status: 'ARCHIVED' },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'PROJECT_ARCHIVED',
          entityType: 'Project',
          entityId: 'proj-1',
          metadata: {
            name: 'Active Project',
          },
        },
      });
      expect(result).toBe(archivedProject);
    });

    it('rejects archive when project is missing', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        archiveProject({
          organizationId: 'org-1',
          actorId: 'user-1',
          projectId: 'missing-proj',
        }),
      ).rejects.toThrow('Project not found');
    });

    it('explicit cross-tenant isolation: rejects archive attempt when Org A tries to archive Org B project', async () => {
      mockPrisma.project.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; organizationId: string } }) => {
          if (
            where.id === 'org-b-proj' &&
            where.organizationId === 'org-a'
          ) {
            return null;
          }
          return null;
        },
      );

      await expect(
        archiveProject({
          organizationId: 'org-a',
          actorId: 'user-a',
          projectId: 'org-b-proj',
        }),
      ).rejects.toThrow('Project not found');
    });
  });
});
