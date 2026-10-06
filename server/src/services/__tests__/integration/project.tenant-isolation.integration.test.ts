import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../../config/db';
import { getProjectById } from '../../project.service';
describe('Project tenant isolation integration', () => {
  const organizationAName = `integration-org-a-${Date.now()}`;
  const organizationBName = `integration-org-b-${Date.now()}`;

  let organizationAId: string;
  let organizationBId: string;
  let projectAId: string;

  it('does not return a project when queried from another organization', async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: organizationAName,
        },
      }),
      prisma.organization.create({
        data: {
          name: organizationBName,
        },
      }),
    ]);

    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const project = await prisma.project.create({
      data: {
        organizationId: organizationAId,
        name: 'Tenant Isolation Test Project',
      },
    });

    projectAId = project.id;

    await expect(
      getProjectById({
        organizationId: organizationBId,
        projectId: projectAId,
      }),
    ).rejects.toThrow('Project not found');
  });

  afterAll(async () => {
    if (organizationAId) {
      await prisma.organization.delete({
        where: {
          id: organizationAId,
        },
      });
    }

    if (organizationBId) {
      await prisma.organization.delete({
        where: {
          id: organizationBId,
        },
      });
    }

    await prisma.$disconnect();
  });
});