import { prisma } from '../config/db';

type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

type CreateProjectInput = {
  organizationId: string;
  actorId: string;
  name: string;
  description?: string;
};

type ListProjectsInput = {
  organizationId: string;
};

type GetProjectInput = {
  organizationId: string;
  projectId: string;
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

export const createProject = async ({
  organizationId,
  actorId,
  name,
  description,
}: CreateProjectInput) => {
  return prisma.$transaction(async (tx) => {
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
}: ListProjectsInput) => {
  return prisma.project.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getProjectById = async ({
  organizationId,
  projectId,
}: GetProjectInput) => {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId,
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
