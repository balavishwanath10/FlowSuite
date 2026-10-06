import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../../config/redis', () => ({
  redis: mockRedis,
}));

import {
  checkFailedLoginLimit,
  clearFailedLoginAttempts,
  MAX_FAILED_LOGIN_ATTEMPTS,
  recordFailedLoginAttempt,
} from '../login-rate-limit.service';

describe('Login rate limit service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkFailedLoginLimit', () => {
    it('returns not blocked when count is lower than limit', async () => {
      mockRedis.get.mockResolvedValue('3');

      const result = await checkFailedLoginLimit('user@example.com');

      expect(mockRedis.get).toHaveBeenCalledWith('failed_login:user@example.com');
      expect(result.isBlocked).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('returns blocked when count is equal or higher than max attempts', async () => {
      mockRedis.get.mockResolvedValue(String(MAX_FAILED_LOGIN_ATTEMPTS));

      const result = await checkFailedLoginLimit('USER@EXAMPLE.COM');

      expect(mockRedis.get).toHaveBeenCalledWith('failed_login:user@example.com');
      expect(result.isBlocked).toBe(true);
      expect(result.attempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    });

    it('handles redis failure gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection error'));

      const result = await checkFailedLoginLimit('user@example.com');

      expect(result.isBlocked).toBe(false);
      expect(result.attempts).toBe(0);
    });
  });

  describe('recordFailedLoginAttempt', () => {
    it('increments counter and sets TTL on first failure', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const attempts = await recordFailedLoginAttempt('user@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith('failed_login:user@example.com');
      expect(mockRedis.expire).toHaveBeenCalledWith('failed_login:user@example.com', 900);
      expect(attempts).toBe(1);
    });

    it('increments counter without setting TTL on subsequent failures', async () => {
      mockRedis.incr.mockResolvedValue(2);

      const attempts = await recordFailedLoginAttempt('user@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith('failed_login:user@example.com');
      expect(mockRedis.expire).not.toHaveBeenCalled();
      expect(attempts).toBe(2);
    });

    it('handles redis failure gracefully', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis connection error'));

      const attempts = await recordFailedLoginAttempt('user@example.com');

      expect(attempts).toBe(0);
    });
  });

  describe('clearFailedLoginAttempts', () => {
    it('deletes the failed login key in redis', async () => {
      mockRedis.del.mockResolvedValue(1);

      await clearFailedLoginAttempts('user@example.com');

      expect(mockRedis.del).toHaveBeenCalledWith('failed_login:user@example.com');
    });

    it('handles redis failure gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis connection error'));

      await expect(clearFailedLoginAttempts('user@example.com')).resolves.not.toThrow();
    });
  });
});
