import { prisma } from '../config/db';
import { checkProjectLimit } from './subscription.service';

type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

type CreateProjectInput = {
  organizationId: string;
  actorId: string;
  name: string;
  description?: string;
};

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';

type ListProjectsInput = {
  organizationId: string;
  userId?: string;
  userRole?: Role;
};

type GetProjectInput = {
  organizationId: string;
  projectId: string;
  userId?: string;
  userRole?: Role;
};

type UpdateProjectInput = {
  organizationId: string;
  actorId: string;
  projectId: string;
  name?: string;
  description?: string;
  status?: ProjectStatus;
};

type ArchiveProjectInput = {
  organizationId: string;
  actorId: string;
  projectId: string;
};

const DEFAULT_FREE_PLAN = {
  name: 'Free',
  seatLimit: 3,
  projectLimit: 2,
};

export class ProjectLimitError extends Error {
  constructor(
    message = 'Project limit reached. Upgrade your plan to create more projects.',
  ) {
    super(message);
    this.name = 'ProjectLimitError';
  }
}

export const createProject = async ({
  organizationId,
  actorId,
  name,
  description,
}: CreateProjectInput) => {
  return prisma.$transaction(async (tx) => {
    const subscription = tx.subscription
      ? await tx.subscription.findUnique({
          where: { organizationId },
          include: { plan: true },
        })
      : null;

    const dbFreePlan = tx.plan
      ? await tx.plan.findUnique({
          where: { name: 'Free' },
        })
      : null;

    const effectivePlan = subscription?.plan ?? dbFreePlan ?? DEFAULT_FREE_PLAN;

    if (effectivePlan.projectLimit !== null) {
      const currentProjectCount = await tx.project.count({
        where: {
          organizationId,
          status: 'ACTIVE',
        },
      });

      if (
        typeof currentProjectCount === 'number' &&
        !checkProjectLimit(effectivePlan, currentProjectCount + 1)
      ) {
        throw new ProjectLimitError();
      }
    }

    const project = await tx.project.create({
      data: {
        organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        status: 'ACTIVE',
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'PROJECT_CREATED',
        entityType: 'Project',
        entityId: project.id,
        metadata: {
          name: project.name,
        },
      },
    });

    return project;
  });
};

export const listOrganizationProjects = async ({
  organizationId,
  userId,
  userRole,
}: ListProjectsInput) => {
  return prisma.project.findMany({
    where: {
      organizationId,
      ...(userRole === 'MEMBER' && userId
        ? {
            tasks: {
              some: {
                assigneeId: userId,
              },
            },
          }
        : {}),
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getProjectById = async ({
  organizationId,
  projectId,
  userId,
  userRole,
}: GetProjectInput) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
      ...(userRole === 'MEMBER' && userId
        ? {
            tasks: {
              some: {
                assigneeId: userId,
              },
            },
          }
        : {}),
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return project;
};

export const updateProject = async ({
  organizationId,
  actorId,
  projectId,
  name,
  description,
  status,
}: UpdateProjectInput) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return prisma.$transaction(async (tx) => {
    const updatedProject = await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(status !== undefined && { status }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'PROJECT_UPDATED',
        entityType: 'Project',
        entityId: project.id,
        metadata: {
          updatedFields: {
            ...(name !== undefined && { name: updatedProject.name }),
            ...(description !== undefined && { description: updatedProject.description }),
            ...(status !== undefined && { status: updatedProject.status }),
          },
        },
      },
    });

    return updatedProject;
  });
};

export const archiveProject = async ({
  organizationId,
  actorId,
  projectId,
}: ArchiveProjectInput) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return prisma.$transaction(async (tx) => {
    const archivedProject = await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        status: 'ARCHIVED',
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'PROJECT_ARCHIVED',
        entityType: 'Project',
        entityId: project.id,
        metadata: {
          name: project.name,
        },
      },
    });

    return archivedProject;
  });
};
