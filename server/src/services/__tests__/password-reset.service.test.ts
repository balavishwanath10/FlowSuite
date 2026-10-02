import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma, mockBcrypt, mockRandomBytes } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockBcrypt: {
    hash: vi.fn(),
  },
  mockRandomBytes: vi.fn(),
}));

vi.mock('../../config/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('bcrypt', () => ({
  default: mockBcrypt,
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: mockRandomBytes,
  },
}));

import {
  requestPasswordReset,
  resetPassword,
} from '../password-reset.service';

describe('Password reset service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a generic response when the email does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await requestPasswordReset({
      email: 'missing@example.com',
    });

    expect(result.message).toContain('If an account exists');
  });

  it('generates a reset token for an existing user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
    });

    mockRandomBytes.mockReturnValue({
      toString: vi.fn().mockReturnValue('test-reset-token'),
    });

    const result = await requestPasswordReset({
      email: 'TEST@EXAMPLE.COM',
    });

    expect(result.resetToken).toBe('test-reset-token');
    expect(result.message).toBe('Password reset token generated');
  });

  it('resets the password with a valid token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
    });

    mockRandomBytes.mockReturnValue({
      toString: vi.fn().mockReturnValue('test-reset-token'),
    });

    await requestPasswordReset({
      email: 'test@example.com',
    });

    mockBcrypt.hash.mockResolvedValue('new-hashed-password');
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-id',
    });

    const result = await resetPassword({
      token: 'test-reset-token',
      newPassword: 'NewPassword123!',
    });

    expect(result.message).toBe('Password reset successful');

    expect(mockBcrypt.hash).toHaveBeenCalledWith(
      'NewPassword123!',
      12,
    );

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: {
        id: 'user-id',
      },
      data: {
        passwordHash: 'new-hashed-password',
      },
    });
  });

  it('rejects an invalid reset token', async () => {
    await expect(
      resetPassword({
        token: 'invalid-token',
        newPassword: 'NewPassword123!',
      }),
    ).rejects.toThrow('Invalid or expired password reset token');
  });
});