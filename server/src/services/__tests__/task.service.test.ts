import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findFirst: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
  assignTask,
  createTask,
  getTaskById,
  listOrganizationTasks,
  updateTask,
  updateTaskStatus,
} from '../task.service';

describe('Task Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTask', () => {
    it('creates a task with default TODO status and writes TASK_CREATED audit log transactionally', async () => {
      const mockProject = { id: 'proj-1', organizationId: 'org-1', name: 'Project 1' };
      const mockCreatedTask = {
        id: 'task-1',
        projectId: 'proj-1',
        title: 'Build API',
        description: 'Implement backend task routes',
        assigneeId: null,
        status: 'TODO',
        createdAt: new Date(),
        updatedAt: new Date(),
        project: { id: 'proj-1', name: 'Project 1' },
        assignee: null,
      };

      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.task.create.mockResolvedValue(mockCreatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await createTask({
        organizationId: 'org-1',
        actorId: 'user-1',
        projectId: 'proj-1',
        title: ' Build API ',
        description: ' Implement backend task routes ',
      });

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'proj-1', organizationId: 'org-1' },
      });
      expect(mockPrisma.task.create).toHaveBeenCalledWith({
        data: {
          projectId: 'proj-1',
          title: 'Build API',
          description: 'Implement backend task routes',
          assigneeId: null,
          status: 'TODO',
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'TASK_CREATED',
          entityType: 'Task',
          entityId: 'task-1',
          metadata: {
            title: 'Build API',
            projectId: 'proj-1',
            assigneeId: null,
            status: 'TODO',
          },
        },
      });
      expect(result).toBe(mockCreatedTask);
    });

    it('rejects creation if target project does not exist within the organization', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(
        createTask({
          organizationId: 'org-1',
          actorId: 'user-1',
          projectId: 'non-existent-proj',
          title: 'Orphan Task',
        }),
      ).rejects.toThrow('Project not found');
    });

    it('explicit cross-tenant isolation: rejects task creation if project belongs to Org B', async () => {
      mockPrisma.project.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; organizationId: string } }) => {
          if (where.id === 'org-b-proj' && where.organizationId === 'org-a') {
            return null;
          }
          return null;
        },
      );

      await expect(
        createTask({
          organizationId: 'org-a',
          actorId: 'user-a',
          projectId: 'org-b-proj',
          title: 'Cross-Tenant Task',
        }),
      ).rejects.toThrow('Project not found');
    });

    it('validates that assignee belongs to the target organization', async () => {
      const mockProject = { id: 'proj-1', organizationId: 'org-1', name: 'Project 1' };
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.membership.findUnique.mockResolvedValue(null); // Assignee has no membership in org-1

      await expect(
        createTask({
          organizationId: 'org-1',
          actorId: 'user-1',
          projectId: 'proj-1',
          title: 'Task for Outsider',
          assigneeId: 'outsider-user',
        }),
      ).rejects.toThrow('Assignee user does not belong to this organization');
    });
  });

  describe('listOrganizationTasks', () => {
    it('returns all org tasks for OWNER, ADMIN, or MANAGER role', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Task 1', assigneeId: 'user-1' },
        { id: 'task-2', title: 'Task 2', assigneeId: 'user-2' },
      ];
      mockPrisma.task.findMany.mockResolvedValue(mockTasks);

      const result = await listOrganizationTasks({
        organizationId: 'org-1',
        userId: 'admin-1',
        userRole: 'ADMIN',
      });

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          project: { organizationId: 'org-1' },
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(mockTasks);
    });

    it('strictly restricts list results to assigned tasks for MEMBER role', async () => {
      const mockTasks = [{ id: 'task-1', title: 'Task 1', assigneeId: 'member-1' }];
      mockPrisma.task.findMany.mockResolvedValue(mockTasks);

      const result = await listOrganizationTasks({
        organizationId: 'org-1',
        userId: 'member-1',
        userRole: 'MEMBER',
      });

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: {
          project: { organizationId: 'org-1' },
          assigneeId: 'member-1',
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toBe(mockTasks);
    });

    it('explicit cross-tenant isolation: does not query tasks across organization boundaries', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);

      await listOrganizationTasks({
        organizationId: 'org-a',
        userId: 'user-a',
        userRole: 'MANAGER',
      });

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            project: expect.objectContaining({ organizationId: 'org-a' }),
          }),
        }),
      );
    });
  });

  describe('getTaskById', () => {
    it('returns task details when found for MANAGER role', async () => {
      const mockTask = { id: 'task-1', title: 'Task 1', assigneeId: 'user-2' };
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);

      const result = await getTaskById({
        organizationId: 'org-1',
        userId: 'manager-1',
        userRole: 'MANAGER',
        taskId: 'task-1',
      });

      expect(result).toBe(mockTask);
    });

    it('returns task for MEMBER role if assigned to that member', async () => {
      const mockTask = { id: 'task-1', title: 'Task 1', assigneeId: 'member-1' };
      mockPrisma.task.findFirst.mockResolvedValue(mockTask);

      const result = await getTaskById({
        organizationId: 'org-1',
        userId: 'member-1',
        userRole: 'MEMBER',
        taskId: 'task-1',
      });

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          project: {
            organizationId: 'org-1',
          },
          assigneeId: 'member-1',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
      expect(result).toBe(mockTask);
    });

    it('rejects with "Task not found" for MEMBER role if task is not assigned to that member', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        getTaskById({
          organizationId: 'org-1',
          userId: 'member-1',
          userRole: 'MEMBER',
          taskId: 'task-1',
        }),
      ).rejects.toThrow('Task not found');

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          project: {
            organizationId: 'org-1',
          },
          assigneeId: 'member-1',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    it('explicit cross-tenant isolation: rejects retrieval when Org A tries to access Org B task', async () => {
      mockPrisma.task.findFirst.mockImplementation(
        async ({ where }: { where: { id: string; project: { organizationId: string } } }) => {
          if (where.id === 'org-b-task' && where.project.organizationId === 'org-a') {
            return null;
          }
          return null;
        },
      );

      await expect(
        getTaskById({
          organizationId: 'org-a',
          userId: 'user-a',
          userRole: 'ADMIN',
          taskId: 'org-b-task',
        }),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('updateTask', () => {
    it('updates task fields and creates TASK_UPDATED audit log transactionally', async () => {
      const existingTask = { id: 'task-1', title: 'Old Title', description: 'Old Desc', status: 'TODO', assigneeId: null };
      const updatedTask = { id: 'task-1', title: 'New Title', description: 'New Desc', status: 'IN_PROGRESS', assigneeId: null };

      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await updateTask({
        organizationId: 'org-1',
        actorId: 'user-1',
        userRole: 'ADMIN',
        taskId: 'task-1',
        title: 'New Title',
        description: 'New Desc',
        status: 'IN_PROGRESS',
      });

      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: {
          title: 'New Title',
          description: 'New Desc',
          status: 'IN_PROGRESS',
        },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'user-1',
          action: 'TASK_UPDATED',
          entityType: 'Task',
          entityId: 'task-1',
          metadata: {
            updatedFields: {
              title: 'New Title',
              description: 'New Desc',
              status: 'IN_PROGRESS',
            },
          },
        },
      });
      expect(result).toBe(updatedTask);
    });

    it('allows general task update for OWNER role', async () => {
      const existingTask = { id: 'task-1', title: 'Old Title' };
      const updatedTask = { id: 'task-1', title: 'Owner Title' };

      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2b' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await updateTask({
        organizationId: 'org-1',
        actorId: 'owner-1',
        userRole: 'OWNER',
        taskId: 'task-1',
        title: 'Owner Title',
      });

      expect(result).toBe(updatedTask);
    });

    it('rejects general task update for MANAGER role', async () => {
      await expect(
        updateTask({
          organizationId: 'org-1',
          actorId: 'manager-1',
          userRole: 'MANAGER',
          taskId: 'task-1',
          title: 'Hacked Title',
        }),
      ).rejects.toThrow('Only owners and admins can update arbitrary task fields');
    });

    it('rejects general task update for MEMBER role', async () => {
      await expect(
        updateTask({
          organizationId: 'org-1',
          actorId: 'member-1',
          userRole: 'MEMBER',
          taskId: 'task-1',
          title: 'Hacked Title',
        }),
      ).rejects.toThrow('Only owners and admins can update arbitrary task fields');
    });

    it('explicit cross-tenant isolation: rejects update if task belongs to Org B', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        updateTask({
          organizationId: 'org-a',
          actorId: 'admin-a',
          userRole: 'ADMIN',
          taskId: 'org-b-task',
          title: 'Hacked Title',
        }),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('updateTaskStatus', () => {
    it('allows MEMBER to update status of an assigned task with TASK_STATUS_UPDATED audit log', async () => {
      const existingTask = { id: 'task-1', status: 'TODO', assigneeId: 'member-1' };
      const updatedTask = { id: 'task-1', status: 'IN_PROGRESS', assigneeId: 'member-1' };

      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-3' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await updateTaskStatus({
        organizationId: 'org-1',
        actorId: 'member-1',
        userId: 'member-1',
        userRole: 'MEMBER',
        taskId: 'task-1',
        status: 'IN_PROGRESS',
      });

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          project: {
            organizationId: 'org-1',
          },
          assigneeId: 'member-1',
        },
      });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_PROGRESS' },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'member-1',
          action: 'TASK_STATUS_UPDATED',
          entityType: 'Task',
          entityId: 'task-1',
          metadata: {
            taskId: 'task-1',
            previousStatus: 'TODO',
            newStatus: 'IN_PROGRESS',
          },
        },
      });
      expect(result).toBe(updatedTask);
    });

    it('rejects status update for MEMBER if task is NOT assigned to that member', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        updateTaskStatus({
          organizationId: 'org-1',
          actorId: 'member-1',
          userId: 'member-1',
          userRole: 'MEMBER',
          taskId: 'task-1',
          status: 'COMPLETED',
        }),
      ).rejects.toThrow('Task not found');

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'task-1',
          project: {
            organizationId: 'org-1',
          },
          assigneeId: 'member-1',
        },
      });
    });

    it('explicit cross-tenant isolation: rejects status update when Org A attempts to modify Org B task status', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        updateTaskStatus({
          organizationId: 'org-a',
          actorId: 'user-a',
          userId: 'user-a',
          userRole: 'MANAGER',
          taskId: 'org-b-task',
          status: 'COMPLETED',
        }),
      ).rejects.toThrow('Task not found');
    });
  });

  describe('assignTask', () => {
    it('assigns task to valid member and creates TASK_ASSIGNED audit log transactionally', async () => {
      const existingTask = { id: 'task-1', assigneeId: null };
      const updatedTask = { id: 'task-1', assigneeId: 'user-2' };
      const mockMembership = { organizationId: 'org-1', userId: 'user-2', role: 'MEMBER' };

      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.membership.findUnique.mockResolvedValue(mockMembership);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-4' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await assignTask({
        organizationId: 'org-1',
        actorId: 'admin-1',
        userRole: 'ADMIN',
        taskId: 'task-1',
        assigneeId: 'user-2',
      });

      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: 'org-1',
            userId: 'user-2',
          },
        },
      });
      expect(mockPrisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { assigneeId: 'user-2' },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'admin-1',
          action: 'TASK_ASSIGNED',
          entityType: 'Task',
          entityId: 'task-1',
          metadata: {
            taskId: 'task-1',
            previousAssigneeId: null,
            newAssigneeId: 'user-2',
          },
        },
      });
      expect(result).toBe(updatedTask);
    });

    it('allows assignTask for MANAGER role', async () => {
      const existingTask = { id: 'task-1', assigneeId: null };
      const updatedTask = { id: 'task-1', assigneeId: 'user-2' };
      const mockMembership = { organizationId: 'org-1', userId: 'user-2', role: 'MEMBER' };

      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.membership.findUnique.mockResolvedValue(mockMembership);
      mockPrisma.task.update.mockResolvedValue(updatedTask);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-4b' });
      mockPrisma.$transaction.mockImplementation(async (cb) => cb(mockPrisma));

      const result = await assignTask({
        organizationId: 'org-1',
        actorId: 'manager-1',
        userRole: 'MANAGER',
        taskId: 'task-1',
        assigneeId: 'user-2',
      });

      expect(result).toBe(updatedTask);
    });

    it('rejects assignTask for MEMBER role', async () => {
      await expect(
        assignTask({
          organizationId: 'org-1',
          actorId: 'member-1',
          userRole: 'MEMBER',
          taskId: 'task-1',
          assigneeId: 'member-1',
        }),
      ).rejects.toThrow('Members cannot assign tasks');
    });

    it('explicit cross-tenant isolation: rejects task assignment if task belongs to Org B', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        assignTask({
          organizationId: 'org-a',
          actorId: 'admin-a',
          userRole: 'ADMIN',
          taskId: 'org-b-task',
          assigneeId: 'user-a',
        }),
      ).rejects.toThrow('Task not found');
    });

    it('rejects assignment if target assignee does not belong to the organization', async () => {
      const existingTask = { id: 'task-1', assigneeId: null };
      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        assignTask({
          organizationId: 'org-1',
          actorId: 'admin-1',
          userRole: 'ADMIN',
          taskId: 'task-1',
          assigneeId: 'outsider-user',
        }),
      ).rejects.toThrow('Assignee user does not belong to this organization');
    });
  });
});
