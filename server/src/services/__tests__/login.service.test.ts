import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockBcrypt } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    membership: {
      findFirst: vi.fn(),
    },
  },
  mockBcrypt: {
    compare: vi.fn(),
  },
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('bcrypt', () => ({
  default: mockBcrypt,
}));

vi.mock('../../services/auth.service', () => ({
  generateAccessToken: vi.fn().mockReturnValue('access-token'),
  generateRefreshToken: vi.fn().mockReturnValue('refresh-token'),
}));

import { loginUser } from '../login.service';

describe('Login service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects login when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      loginUser({
        email: 'missing@example.com',
        password: 'TestPassword123!',
      }),
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects login when the password is incorrect', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
    });

    mockBcrypt.compare.mockResolvedValue(false);

    await expect(
      loginUser({
        email: 'test@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects login when membership is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
    });

    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.membership.findFirst.mockResolvedValue(null);

    await expect(
      loginUser({
        email: 'test@example.com',
        password: 'TestPassword123!',
      }),
    ).rejects.toThrow('User organization membership not found');
  });

  it('logs in successfully with valid credentials and membership', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
    });

    mockBcrypt.compare.mockResolvedValue(true);

    mockPrisma.membership.findFirst.mockResolvedValue({
      organizationId: 'organization-id',
      role: 'OWNER',
    });

    const result = await loginUser({
      email: 'TEST@EXAMPLE.COM',
      password: 'TestPassword123!',
    });

    expect(result.user.email).toBe('test@example.com');
    expect(result.organization.id).toBe('organization-id');
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });
});