import { prisma } from '../config/db';

export type ListAuditLogsInput = {
  organizationId: string;
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
};

export const listOrganizationAuditLogs = async ({
  organizationId,
  page = 1,
  limit = 20,
  action,
  actorId,
}: ListAuditLogsInput) => {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const skip = (safePage - 1) * safeLimit;

  const where = {
    organizationId,
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const [total, auditLogs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: safeLimit,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / safeLimit);

  return {
    auditLogs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
};
