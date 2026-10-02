import { describe, expect, it } from 'vitest';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../auth.service';

describe('JWT authentication service', () => {
  const payload = {
    userId: 'test-user-id',
    organizationId: 'test-organization-id',
  };

  it('generates and verifies an access token', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.organizationId).toBe(payload.organizationId);
  });

  it('generates and verifies a refresh token', () => {
    const token = generateRefreshToken(payload);
    const decoded = verifyRefreshToken(token);

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.organizationId).toBe(payload.organizationId);
  });

  it('rejects an invalid access token', () => {
    expect(() => verifyAccessToken('invalid-token')).toThrow();
  });

  it('rejects an invalid refresh token', () => {
    expect(() => verifyRefreshToken('invalid-token')).toThrow();
  });
});