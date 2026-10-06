import { redis } from '../config/redis';

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const FAILED_LOGIN_WINDOW_SECONDS = 900; // 15 minutes

export async function checkFailedLoginLimit(
  email: string,
): Promise<{ isBlocked: boolean; attempts: number }> {
  try {
    const key = `failed_login:${email.trim().toLowerCase()}`;
    const value = await redis.get(key);
    const attempts = value ? parseInt(value, 10) : 0;
    return {
      isBlocked: attempts >= MAX_FAILED_LOGIN_ATTEMPTS,
      attempts,
    };
  } catch (error) {
    console.warn('Redis failed login limit check warning:', error);
    return { isBlocked: false, attempts: 0 };
  }
}

export async function recordFailedLoginAttempt(email: string): Promise<number> {
  try {
    const key = `failed_login:${email.trim().toLowerCase()}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) {
      await redis.expire(key, FAILED_LOGIN_WINDOW_SECONDS);
    }
    return attempts;
  } catch (error) {
    console.warn('Redis failed login increment warning:', error);
    return 0;
  }
}

export async function clearFailedLoginAttempts(email: string): Promise<void> {
  try {
    const key = `failed_login:${email.trim().toLowerCase()}`;
    await redis.del(key);
  } catch (error) {
    console.warn('Redis failed login clear warning:', error);
  }
}
