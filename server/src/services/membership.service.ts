import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../config/db';
import { checkSeatLimit } from './subscription.service';

type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';

type ListMembersInput = {
  organizationId: string;
};

type InviteMemberInput = {
  organizationId: string;
  actorId: string;
  email: string;
  role?: Role;
};

type AcceptInvitationInput = {
  token: string;
  name?: string;
  password?: string;
};

type UpdateMemberRoleInput = {
  organizationId: string;
  actorId: string;
  membershipId: string;
  role: Role;
};

type RemoveMemberInput = {
  organizationId: string;
  actorId: string;
  membershipId: string;
};

const INVITATION_TOKEN_EXPIRY_HOURS = 24;

interface InvitationRecord {
  token: string;
  organizationId: string;
  email: string;
  role: Role;
  actorId: string;
  expiresAt: number;
}

const invitationTokens = new Map<string, InvitationRecord>();

const getPendingInvitationCount = (organizationId: string): number => {
  const now = Date.now();
  let count = 0;
  for (const invitation of invitationTokens.values()) {
    if (invitation.organizationId === organizationId && invitation.expiresAt > now) {
      count++;
    }
  }
  return count;
};

export const clearInvitationTokens = () => {
  invitationTokens.clear();
};

export const listOrganizationMembers = async ({
  organizationId,
}: ListMembersInput) => {
  return prisma.membership.findMany({
    where: {
      organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });
};

const DEFAULT_FREE_PLAN = {
  name: 'Free',
  seatLimit: 3,
  projectLimit: 2,
};

export class SeatLimitError extends Error {
  constructor(
    message = 'Seat limit reached. Upgrade your plan to add more members.',
  ) {
    super(message);
    this.name = 'SeatLimitError';
  }
}

export const inviteOrganizationMember = async ({
  organizationId,
  actorId,
  email,
  role = 'MEMBER',
}: InviteMemberInput) => {
  const normalizedEmail = email.trim().toLowerCase();

  if (role === 'OWNER') {
    throw new Error('The organization owner role cannot be assigned');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: existingUser.id,
        },
      },
    });

    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }
  }

  const subscription = prisma.subscription
    ? await prisma.subscription.findUnique({
        where: { organizationId },
        include: { plan: true },
      })
    : null;

  const dbFreePlan = prisma.plan
    ? await prisma.plan.findUnique({
        where: { name: 'Free' },
      })
    : null;

  const effectivePlan = subscription?.plan ?? dbFreePlan ?? DEFAULT_FREE_PLAN;

  const currentMemberCount = await prisma.membership.count({
    where: { organizationId },
  });

  const pendingInviteCount = getPendingInvitationCount(organizationId);

  if (
    typeof currentMemberCount === 'number' &&
    !checkSeatLimit(effectivePlan, currentMemberCount + pendingInviteCount + 1)
  ) {
    throw new SeatLimitError();
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt =
    Date.now() + INVITATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;

  invitationTokens.set(token, {
    token,
    organizationId,
    email: normalizedEmail,
    role,
    actorId,
    expiresAt,
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorId,
      action: 'MEMBER_INVITED',
      entityType: 'Invitation',
      metadata: {
        invitedEmail: normalizedEmail,
        role,
      },
    },
  });

  return {
    invitationToken: token,
    email: normalizedEmail,
    role,
    expiresAt: new Date(expiresAt).toISOString(),
  };
};

export const acceptInvitation = async ({
  token,
  name,
  password,
}: AcceptInvitationInput) => {
  const invitation = invitationTokens.get(token);

  if (!invitation || invitation.expiresAt < Date.now()) {
    if (invitation) {
      invitationTokens.delete(token);
    }
    throw new Error('Invalid or expired invitation token');
  }

  const { organizationId, email, role, actorId } = invitation;

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { email },
    });

    if (user) {
      const existingMembership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: user.id,
          },
        },
      });

      if (existingMembership) {
        throw new Error('User is already a member of this organization');
      }
    }

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

    const currentMemberCount = await tx.membership.count({
      where: { organizationId },
    });

    if (
      typeof currentMemberCount === 'number' &&
      !checkSeatLimit(effectivePlan, currentMemberCount + 1)
    ) {
      throw new SeatLimitError();
    }

    if (!user) {
      if (!name || !password) {
        throw new Error(
          'Name and password are required to create a new account',
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);
      user = await tx.user.create({
        data: {
          name: name.trim(),
          email,
          passwordHash,
        },
      });
    }

    const existingMembership = await tx.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      throw new Error('User is already a member of this organization');
    }

    const membership = await tx.membership.create({
      data: {
        organizationId,
        userId: user.id,
        role,
      },
      include: {
        user: {
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
        action: 'INVITATION_ACCEPTED',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: {
          targetUserId: user.id,
          targetEmail: user.email,
          role: membership.role,
        },
      },
    });

    return membership;
  });

  invitationTokens.delete(token);

  return result;
};

export const updateMemberRole = async ({
  organizationId,
  actorId,
  membershipId,
  role,
}: UpdateMemberRoleInput) => {
  if (role === 'OWNER') {
    throw new Error('The organization owner role cannot be assigned');
  }

  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error('Organization membership not found');
  }

  if (membership.role === 'OWNER') {
    throw new Error('The organization owner role cannot be changed');
  }

  return prisma.$transaction(async (tx) => {
    const updatedMembership = await tx.membership.update({
      where: {
        id: membership.id,
      },
      data: {
        role,
      },
      include: {
        user: {
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
        action: 'MEMBER_ROLE_UPDATED',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: {
          targetUserId: membership.userId,
          previousRole: membership.role,
          newRole: role,
        },
      },
    });

    return updatedMembership;
  });
};

export const removeOrganizationMember = async ({
  organizationId,
  actorId,
  membershipId,
}: RemoveMemberInput) => {
  const membership = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error('Organization membership not found');
  }

  if (membership.role === 'OWNER') {
    throw new Error('The organization owner cannot be removed');
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({
      where: {
        id: membership.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'MEMBER_REMOVED',
        entityType: 'Membership',
        entityId: membership.id,
        metadata: {
          targetUserId: membership.userId,
          removedRole: membership.role,
        },
      },
    });
  });

  return {
    message: 'Organization member removed successfully',
  };
};