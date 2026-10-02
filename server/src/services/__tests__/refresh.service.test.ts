import { describe, expect, it, vi } from 'vitest';

const { mockVerifyRefreshToken, mockGenerateAccessToken } = vi.hoisted(() => ({
  mockVerifyRefreshToken: vi.fn(),
  mockGenerateAccessToken: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({
  verifyRefreshToken: mockVerifyRefreshToken,
  generateAccessToken: mockGenerateAccessToken,
}));

import { refreshAccessToken } from '../refresh.service';

describe('Refresh token service', () => {
  it('generates a new access token from a valid refresh token', () => {
    mockVerifyRefreshToken.mockReturnValue({
      userId: 'user-id',
      organizationId: 'organization-id',
    });

    mockGenerateAccessToken.mockReturnValue('new-access-token');

    const result = refreshAccessToken({
      refreshToken: 'valid-refresh-token',
    });

    expect(result.accessToken).toBe('new-access-token');

    expect(mockVerifyRefreshToken).toHaveBeenCalledWith(
      'valid-refresh-token',
    );

    expect(mockGenerateAccessToken).toHaveBeenCalledWith({
      userId: 'user-id',
      organizationId: 'organization-id',
    });
  });

  it('rejects an invalid refresh token', () => {
    mockVerifyRefreshToken.mockImplementation(() => {
      throw new Error('Invalid or expired refresh token');
    });

    expect(() =>
      refreshAccessToken({
        refreshToken: 'invalid-refresh-token',
      }),
    ).toThrow('Invalid or expired refresh token');
  });
});