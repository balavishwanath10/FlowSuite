import { prisma } from '../config/db';

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';

type CreateTaskInput = {
  organizationId: string;
  actorId: string;
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  status?: TaskStatus;
};

type ListTasksInput = {
  organizationId: string;
  userId: string;
  userRole: Role;
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus;
};

type GetTaskInput = {
  organizationId: string;
  userId: string;
  userRole: Role;
  taskId: string;
};

type UpdateTaskInput = {
  organizationId: string;
  actorId: string;
  userRole: Role;
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string | null;
};

type UpdateTaskStatusInput = {
  organizationId: string;
  actorId: string;
  userId: string;
  userRole: Role;
  taskId: string;
  status: TaskStatus;
};

type AssignTaskInput = {
  organizationId: string;
  actorId: string;
  userRole: Role;
  taskId: string;
  assigneeId: string | null;
};

export const createTask = async ({
  organizationId,
  actorId,
  projectId,
  title,
  description,
  assigneeId,
  status = 'TODO',
}: CreateTaskInput) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (assigneeId) {
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: assigneeId,
        },
      },
    });

    if (!membership) {
      throw new Error('Assignee user does not belong to this organization');
    }
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        projectId: project.id,
        title: title.trim(),
        description: description?.trim() || null,
        assigneeId: assigneeId || null,
        status,
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

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'TASK_CREATED',
        entityType: 'Task',
        entityId: task.id,
        metadata: {
          title: task.title,
          projectId: task.projectId,
          assigneeId: task.assigneeId,
          status: task.status,
        },
      },
    });

    return task;
  });
};

export const listOrganizationTasks = async ({
  organizationId,
  userId,
  userRole,
  projectId,
  assigneeId,
  status,
}: ListTasksInput) => {
  const effectiveAssigneeId = userRole === 'MEMBER' ? userId : assigneeId;

  return prisma.task.findMany({
    where: {
      project: {
        organizationId,
        ...(projectId ? { id: projectId } : {}),
      },
      ...(effectiveAssigneeId ? { assigneeId: effectiveAssigneeId } : {}),
      ...(status ? { status } : {}),
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
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getTaskById = async ({
  organizationId,
  userId,
  userRole,
  taskId,
}: GetTaskInput) => {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        organizationId,
      },
      ...(userRole === 'MEMBER' ? { assigneeId: userId } : {}),
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

  if (!task) {
    throw new Error('Task not found');
  }

  return task;
};

export const updateTask = async ({
  organizationId,
  actorId,
  userRole,
  taskId,
  title,
  description,
  status,
  assigneeId,
}: UpdateTaskInput) => {
  if (userRole !== 'OWNER' && userRole !== 'ADMIN') {
    throw new Error('Only owners and admins can update arbitrary task fields');
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        organizationId,
      },
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  if (assigneeId !== undefined && assigneeId !== null) {
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: assigneeId,
        },
      },
    });

    if (!membership) {
      throw new Error('Assignee user does not belong to this organization');
    }
  }

  return prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(status !== undefined && { status }),
        ...(assigneeId !== undefined && { assigneeId }),
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

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'TASK_UPDATED',
        entityType: 'Task',
        entityId: task.id,
        metadata: {
          updatedFields: {
            ...(title !== undefined && { title: updatedTask.title }),
            ...(description !== undefined && { description: updatedTask.description }),
            ...(status !== undefined && { status: updatedTask.status }),
            ...(assigneeId !== undefined && { assigneeId: updatedTask.assigneeId }),
          },
        },
      },
    });

    return updatedTask;
  });
};

export const updateTaskStatus = async ({
  organizationId,
  actorId,
  userId,
  userRole,
  taskId,
  status,
}: UpdateTaskStatusInput) => {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        organizationId,
      },
      ...(userRole === 'MEMBER' ? { assigneeId: userId } : {}),
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  return prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data: {
        status,
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

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'TASK_STATUS_UPDATED',
        entityType: 'Task',
        entityId: task.id,
        metadata: {
          taskId: task.id,
          previousStatus: task.status,
          newStatus: status,
        },
      },
    });

    return updatedTask;
  });
};

export const assignTask = async ({
  organizationId,
  actorId,
  userRole,
  taskId,
  assigneeId,
}: AssignTaskInput) => {
  if (userRole === 'MEMBER') {
    throw new Error('Members cannot assign tasks');
  }

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        organizationId,
      },
    },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  if (assigneeId !== null) {
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: assigneeId,
        },
      },
    });

    if (!membership) {
      throw new Error('Assignee user does not belong to this organization');
    }
  }

  return prisma.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: {
        id: task.id,
      },
      data: {
        assigneeId,
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

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'TASK_ASSIGNED',
        entityType: 'Task',
        entityId: task.id,
        metadata: {
          taskId: task.id,
          previousAssigneeId: task.assigneeId,
          newAssigneeId: assigneeId,
        },
      },
    });

    return updatedTask;
  });
};
