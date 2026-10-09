import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
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
  ProjectLimitError,
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

    it('rejects project creation when organization project limit is reached', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          projectLimit: 2,
        },
      });
      mockPrisma.project.count.mockResolvedValue(2); // Current project count is 2 (equals limit)

      await expect(
        createProject({
          organizationId: 'org-1',
          actorId: 'user-1',
          name: 'Third Project',
        }),
      ).rejects.toThrow(
        'Project limit reached. Upgrade your plan to create more projects.',
      );

      expect(mockPrisma.project.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('allows project creation when project count is below plan limit', async () => {
      const mockProject = {
        id: 'proj-2',
        organizationId: 'org-1',
        name: 'Second Project',
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          projectLimit: 2,
        },
      });
      mockPrisma.project.count.mockResolvedValue(1); // Current count is 1 (below limit of 2)
      mockPrisma.project.create.mockResolvedValue(mockProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      const result = await createProject({
        organizationId: 'org-1',
        actorId: 'user-1',
        name: 'Second Project',
      });

      expect(result).toBe(mockProject);
      expect(mockPrisma.project.create).toHaveBeenCalled();
    });

    it('allows unlimited project creation when plan projectLimit is null', async () => {
      const mockProject = {
        id: 'proj-100',
        organizationId: 'org-pro',
        name: 'Project 100',
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-pro',
        plan: {
          id: 'plan-pro',
          name: 'Professional',
          projectLimit: null, // Unlimited
        },
      });
      mockPrisma.project.create.mockResolvedValue(mockProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-pro' });

      const result = await createProject({
        organizationId: 'org-pro',
        actorId: 'user-1',
        name: 'Project 100',
      });

      expect(result).toBe(mockProject);
      expect(mockPrisma.project.count).not.toHaveBeenCalled(); // Skipped because limit is null
      expect(mockPrisma.project.create).toHaveBeenCalled();
    });

    it('falls back to default Free plan limit when subscription record is missing', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue(null); // Missing subscription
      mockPrisma.plan.findUnique.mockResolvedValue({
        id: 'plan-free-default',
        name: 'Free',
        projectLimit: 2,
      });
      mockPrisma.project.count.mockResolvedValue(2); // At Free limit of 2

      await expect(
        createProject({
          organizationId: 'org-nosub',
          actorId: 'user-1',
          name: 'Fallback Overlimit Project',
        }),
      ).rejects.toThrow(
        'Project limit reached. Upgrade your plan to create more projects.',
      );

      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith({
        where: { name: 'Free' },
      });
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });

    it('does not count archived projects towards active project limit', async () => {
      const mockProject = {
        id: 'proj-3',
        organizationId: 'org-1',
        name: 'New Active Project',
        status: 'ACTIVE',
      };

      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          projectLimit: 2,
        },
      });
      // Mock count for ACTIVE projects returns 1 (even if total including ARCHIVED was 2)
      mockPrisma.project.count.mockResolvedValue(1);
      mockPrisma.project.create.mockResolvedValue(mockProject);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-archived-test' });

      const result = await createProject({
        organizationId: 'org-1',
        actorId: 'user-1',
        name: 'New Active Project',
      });

      expect(mockPrisma.project.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: 'ACTIVE',
        },
      });
      expect(result).toBe(mockProject);
    });

    it('falls back to Free plan project limit (2 projects) when subscription and plan are missing from DB', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(null);
      mockPrisma.project.count.mockResolvedValue(2); // 2 existing active projects

      await expect(
        createProject({
          organizationId: 'org-noplan',
          actorId: 'user-1',
          name: '3rd Project',
        }),
      ).rejects.toThrow(ProjectLimitError);

      expect(mockPrisma.project.create).not.toHaveBeenCalled();
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
