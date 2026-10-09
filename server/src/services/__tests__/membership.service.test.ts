import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockBcrypt } = vi.hoisted(() => ({
  mockPrisma: {
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  mockBcrypt: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('bcrypt', () => ({
  default: mockBcrypt,
}));

import {
  SeatLimitError,
  acceptInvitation,
  clearInvitationTokens,
  inviteOrganizationMember,
  listOrganizationMembers,
  removeOrganizationMember,
  updateMemberRole,
} from '../membership.service';

describe('Membership Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed-password');
    clearInvitationTokens();
  });

  describe('listOrganizationMembers', () => {
    it('returns organization members scoped by organizationId', async () => {
      const mockMembers = [
        {
          id: 'mem-1',
          organizationId: 'org-1',
          userId: 'user-1',
          role: 'OWNER',
          user: { id: 'user-1', name: 'Owner User', email: 'owner@example.com' },
        },
      ];
      mockPrisma.membership.findMany.mockResolvedValue(mockMembers);

      const result = await listOrganizationMembers({ organizationId: 'org-1' });

      expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
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
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toBe(mockMembers);
    });
  });

  describe('inviteOrganizationMember', () => {
    it('rejects inviting a user with the OWNER role', async () => {
      await expect(
        inviteOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          email: 'newuser@example.com',
          role: 'OWNER',
        }),
      ).rejects.toThrow('The organization owner role cannot be assigned');
    });

    it('rejects inviting a user who is already a member of the organization', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'existing@example.com',
      });
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-2',
        organizationId: 'org-1',
        userId: 'user-2',
        role: 'MEMBER',
      });

      await expect(
        inviteOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          email: 'existing@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('generates an invitation token and creates an audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'invited@example.com',
        role: 'ADMIN',
      });

      expect(result.email).toBe('invited@example.com');
      expect(result.role).toBe('ADMIN');
      expect(typeof result.invitationToken).toBe('string');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'actor-1',
          action: 'MEMBER_INVITED',
          entityType: 'Invitation',
          metadata: {
            invitedEmail: 'invited@example.com',
            role: 'ADMIN',
          },
        },
      });
    });

    it('rejects invitation when organization seat limit is reached', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          seatLimit: 2,
        },
      });
      mockPrisma.membership.count.mockResolvedValue(2); // Seat limit reached

      await expect(
        inviteOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          email: 'overlimit@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(
        'Seat limit reached. Upgrade your plan to add more members.',
      );

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    it('rejects invalid or missing invitation token', async () => {
      await expect(
        acceptInvitation({
          token: 'invalid-token',
        }),
      ).rejects.toThrow('Invalid or expired invitation token');
    });

    it('rejects an expired invitation token and prevents subsequent acceptance', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-expired' });

      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'expired@example.com',
        role: 'MEMBER',
      });

      // Advance time by 25 hours (past 24-hour expiry threshold)
      vi.setSystemTime(now + 25 * 60 * 60 * 1000);

      // Attempting to accept should fail with "Invalid or expired invitation token"
      await expect(
        acceptInvitation({
          token: invite.invitationToken,
          name: 'Expired User',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Invalid or expired invitation token');

      // Subsequent attempt should also fail
      await expect(
        acceptInvitation({
          token: invite.invitationToken,
          name: 'Expired User',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Invalid or expired invitation token');

      vi.useRealTimers();
    });

    it('rejects creating new user account when name or password is missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'newuser@example.com',
        role: 'MEMBER',
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });

      await expect(
        acceptInvitation({
          token: invite.invitationToken,
        }),
      ).rejects.toThrow(
        'Name and password are required to create a new account',
      );
    });

    it('accepts invitation for a new user, creates account and membership transactionally', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-new',
        name: 'New Member',
        email: 'newmember@example.com',
      });
      mockPrisma.membership.findUnique.mockResolvedValue(null);

      const mockMembership = {
        id: 'mem-new',
        organizationId: 'org-1',
        userId: 'user-new',
        role: 'MEMBER',
        user: { id: 'user-new', name: 'New Member', email: 'newmember@example.com' },
      };
      mockPrisma.membership.create.mockResolvedValue(mockMembership);

      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'newmember@example.com',
        role: 'MEMBER',
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });

      const result = await acceptInvitation({
        token: invite.invitationToken,
        name: 'New Member',
        password: 'Password123!',
      });

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'user-new',
          role: 'MEMBER',
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'actor-1',
          action: 'INVITATION_ACCEPTED',
          entityType: 'Membership',
          entityId: 'mem-new',
          metadata: {
            targetUserId: 'user-new',
            targetEmail: 'newmember@example.com',
            role: 'MEMBER',
          },
        },
      });
      expect(result).toBe(mockMembership);
    });

    it('enforces single-use token on invitation acceptance', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-exist',
        email: 'exist@example.com',
      });
      mockPrisma.membership.findUnique.mockResolvedValue(null);
      mockPrisma.membership.create.mockResolvedValue({ id: 'mem-exist' });

      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'exist@example.com',
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });

      await acceptInvitation({ token: invite.invitationToken });

      // Second use should fail
      await expect(
        acceptInvitation({ token: invite.invitationToken }),
      ).rejects.toThrow('Invalid or expired invitation token');
    });

    it('rejects invitation acceptance when organization seat limit is reached', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'acceptoverlimit@example.com',
        role: 'MEMBER',
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          seatLimit: 2,
        },
      });
      mockPrisma.membership.count.mockResolvedValue(2); // Seat limit reached at acceptance time

      await expect(
        acceptInvitation({
          token: invite.invitationToken,
          name: 'Overlimit User',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        'Seat limit reached. Upgrade your plan to add more members.',
      );

      expect(mockPrisma.membership.create).not.toHaveBeenCalled();
    });

    it('counts pending invitations towards seat capacity when issuing new invitations', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        plan: {
          id: 'plan-free',
          name: 'Free',
          seatLimit: 2,
        },
      });
      mockPrisma.membership.count.mockResolvedValue(1); // 1 active member

      // First invitation succeeds (1 active + 0 pending + 1 new = 2 <= 2)
      await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'pending1@example.com',
        role: 'MEMBER',
      });

      // Second invitation is rejected (1 active + 1 pending + 1 new = 3 > 2)
      await expect(
        inviteOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          email: 'pending2@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(
        'Seat limit reached. Upgrade your plan to add more members.',
      );
    });

    it('returns duplicate member error when an existing member attempts to accept invitation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      // Issue invitation
      const invite = await inviteOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        email: 'already@example.com',
        role: 'MEMBER',
      });

      // Setup transaction mocks: user exists and already has membership
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-already',
        email: 'already@example.com',
      });
      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'mem-already',
        organizationId: 'org-1',
        userId: 'user-already',
      });

      // Attempting to accept should throw duplicate membership error, NOT seat limit error
      await expect(
        acceptInvitation({
          token: invite.invitationToken,
        }),
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('allows third seat and rejects fourth seat under Free plan seat limit (3 seats)', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        organizationId: 'org-free',
        plan: {
          id: 'plan-free',
          name: 'Free',
          seatLimit: 3,
        },
      });

      // 2 active members -> 3rd seat invite succeeds (2 active + 0 pending + 1 new = 3 <= 3)
      mockPrisma.membership.count.mockResolvedValue(2);
      const invite3 = await inviteOrganizationMember({
        organizationId: 'org-free',
        actorId: 'actor-1',
        email: 'seat3@example.com',
        role: 'MEMBER',
      });
      expect(invite3.email).toBe('seat3@example.com');

      // 3 active members -> 4th seat invite fails (3 active + 0 pending + 1 new = 4 > 3)
      mockPrisma.membership.count.mockResolvedValue(3);
      await expect(
        inviteOrganizationMember({
          organizationId: 'org-free',
          actorId: 'actor-1',
          email: 'seat4@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(
        'Seat limit reached. Upgrade your plan to add more members.',
      );
    });

    it('falls back to Free plan seat limit (3 seats) when subscription and plan are missing from DB', async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockPrisma.plan.findUnique.mockResolvedValue(null);
      mockPrisma.membership.count.mockResolvedValue(3); // 3 existing members

      await expect(
        inviteOrganizationMember({
          organizationId: 'org-noplan',
          actorId: 'actor-1',
          email: 'noplan@example.com',
          role: 'MEMBER',
        }),
      ).rejects.toThrow(SeatLimitError);
    });
  });

  describe('updateMemberRole', () => {
    it('rejects assigning the OWNER role', async () => {
      await expect(
        updateMemberRole({
          organizationId: 'org-1',
          actorId: 'actor-1',
          membershipId: 'mem-1',
          role: 'OWNER',
        }),
      ).rejects.toThrow('The organization owner role cannot be assigned');
    });

    it('rejects updating a non-existent membership', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        updateMemberRole({
          organizationId: 'org-1',
          actorId: 'actor-1',
          membershipId: 'mem-missing',
          role: 'ADMIN',
        }),
      ).rejects.toThrow('Organization membership not found');
    });

    it('rejects changing the role of an organization OWNER', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'mem-owner',
        organizationId: 'org-1',
        userId: 'user-owner',
        role: 'OWNER',
      });

      await expect(
        updateMemberRole({
          organizationId: 'org-1',
          actorId: 'actor-1',
          membershipId: 'mem-owner',
          role: 'ADMIN',
        }),
      ).rejects.toThrow('The organization owner role cannot be changed');
    });

    it('successfully updates role transactionally and creates an audit log', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'mem-member',
        organizationId: 'org-1',
        userId: 'user-member',
        role: 'MEMBER',
      });
      const updated = {
        id: 'mem-member',
        organizationId: 'org-1',
        userId: 'user-member',
        role: 'MANAGER',
      };
      mockPrisma.membership.update.mockResolvedValue(updated);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-3' });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });

      const result = await updateMemberRole({
        organizationId: 'org-1',
        actorId: 'actor-1',
        membershipId: 'mem-member',
        role: 'MANAGER',
      });

      expect(mockPrisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'mem-member' },
        data: { role: 'MANAGER' },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'actor-1',
          action: 'MEMBER_ROLE_UPDATED',
          entityType: 'Membership',
          entityId: 'mem-member',
          metadata: {
            targetUserId: 'user-member',
            previousRole: 'MEMBER',
            newRole: 'MANAGER',
          },
        },
      });
      expect(result).toBe(updated);
    });
  });

  describe('removeOrganizationMember', () => {
    it('rejects removing a non-existent membership', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        removeOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          membershipId: 'mem-missing',
        }),
      ).rejects.toThrow('Organization membership not found');
    });

    it('rejects removing an organization OWNER', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'mem-owner',
        organizationId: 'org-1',
        userId: 'user-owner',
        role: 'OWNER',
      });

      await expect(
        removeOrganizationMember({
          organizationId: 'org-1',
          actorId: 'actor-1',
          membershipId: 'mem-owner',
        }),
      ).rejects.toThrow('The organization owner cannot be removed');
    });

    it('successfully removes member transactionally and creates an audit log', async () => {
      mockPrisma.membership.findFirst.mockResolvedValue({
        id: 'mem-remove',
        organizationId: 'org-1',
        userId: 'user-remove',
        role: 'MEMBER',
      });
      mockPrisma.membership.delete.mockResolvedValue({ id: 'mem-remove' });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-4' });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        return cb(mockPrisma);
      });

      const result = await removeOrganizationMember({
        organizationId: 'org-1',
        actorId: 'actor-1',
        membershipId: 'mem-remove',
      });

      expect(mockPrisma.membership.delete).toHaveBeenCalledWith({
        where: { id: 'mem-remove' },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorId: 'actor-1',
          action: 'MEMBER_REMOVED',
          entityType: 'Membership',
          entityId: 'mem-remove',
          metadata: {
            targetUserId: 'user-remove',
            removedRole: 'MEMBER',
          },
        },
      });
      expect(result.message).toBe('Organization member removed successfully');
    });
  });

  describe('tenant isolation', () => {
    it('prevents modifying or removing a membership belonging to Org B when called with Org A organizationId', async () => {
      // Mock prisma.membership.findFirst to return null when queried with Org A organizationId for Org B membershipId
      mockPrisma.membership.findFirst.mockImplementation(
        async ({
          where,
        }: {
          where: { id: string; organizationId: string };
        }) => {
          if (
            where.id === 'org-b-membership' &&
            where.organizationId === 'org-a'
          ) {
            return null;
          }
          return null;
        },
      );

      // Verify updateMemberRole with Org A organizationId attempting to modify Org B membership throws "Organization membership not found"
      await expect(
        updateMemberRole({
          organizationId: 'org-a',
          actorId: 'actor-a',
          membershipId: 'org-b-membership',
          role: 'ADMIN',
        }),
      ).rejects.toThrow('Organization membership not found');

      // Verify removeOrganizationMember with Org A organizationId attempting to remove Org B membership throws "Organization membership not found"
      await expect(
        removeOrganizationMember({
          organizationId: 'org-a',
          actorId: 'actor-a',
          membershipId: 'org-b-membership',
        }),
      ).rejects.toThrow('Organization membership not found');
    });
  });
});
