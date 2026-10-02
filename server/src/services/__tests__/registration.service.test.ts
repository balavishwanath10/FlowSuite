import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-password'),
  },
}));

vi.mock('../../services/auth.service', () => ({
  generateAccessToken: vi.fn().mockReturnValue('access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('refresh-token'),
}));

import { registerUser } from '../registration.service';

describe('Registration service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects registration when the email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-user-id',
      email: 'existing@example.com',
    });

    await expect(
      registerUser({
        name: 'Test User',
        email: 'existing@example.com',
        password: 'TestPassword123!',
        organizationName: 'Test Organization',
      }),
    ).rejects.toThrow('An account with this email already exists');
  });

  it('rejects registration when the Free plan is not configured', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.plan.findUnique.mockResolvedValue(null);

    await expect(
      registerUser({
        name: 'Test User',
        email: 'new@example.com',
        password: 'TestPassword123!',
        organizationName: 'Test Organization',
      }),
    ).rejects.toThrow('Free plan is not configured');
  });

  it('creates a user, organization, owner membership and Free subscription', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    mockPrisma.plan.findUnique.mockResolvedValue({
      id: 'free-plan-id',
      name: 'Free',
    });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'user-id',
            name: 'Test User',
            email: 'new@example.com',
            passwordHash: 'hashed-password',
          }),
        },
        organization: {
          create: vi.fn().mockResolvedValue({
            id: 'organization-id',
            name: 'Test Organization',
          }),
        },
        membership: {
          create: vi.fn().mockResolvedValue({
            id: 'membership-id',
            role: 'OWNER',
          }),
        },
        subscription: {
          create: vi.fn().mockResolvedValue({
            id: 'subscription-id',
            status: 'TRIALING',
          }),
        },
      };

      return callback(tx);
    });

    const result = await registerUser({
      name: 'Test User',
      email: 'NEW@EXAMPLE.COM',
      password: 'TestPassword123!',
      organizationName: 'Test Organization',
    });

    expect(result.user.email).toBe('new@example.com');
    expect(result.organization.name).toBe('Test Organization');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });
});