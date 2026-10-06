import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Request, Response } from 'express';

const {
  mockLoginUser,
  mockRegisterUser,
  mockCheckFailedLoginLimit,
  mockRecordFailedLoginAttempt,
  mockClearFailedLoginAttempts,
} = vi.hoisted(() => ({
  mockLoginUser: vi.fn(),
  mockRegisterUser: vi.fn(),
  mockCheckFailedLoginLimit: vi.fn(),
  mockRecordFailedLoginAttempt: vi.fn(),
  mockClearFailedLoginAttempts: vi.fn(),
}));

vi.mock('../../services/login.service', () => ({
  loginUser: mockLoginUser,
}));

vi.mock('../../services/registration.service', () => ({
  registerUser: mockRegisterUser,
}));

vi.mock('../../services/login-rate-limit.service', () => ({
  checkFailedLoginLimit: mockCheckFailedLoginLimit,
  recordFailedLoginAttempt: mockRecordFailedLoginAttempt,
  clearFailedLoginAttempts: mockClearFailedLoginAttempts,
}));

import authRoutes from '../auth.routes';

describe('Auth Routes', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn().mockReturnThis();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    req = {
      body: {},
    };

    res = {
      status: statusMock as any,
      json: jsonMock as any,
    };

    mockCheckFailedLoginLimit.mockResolvedValue({ isBlocked: false, attempts: 0 });
  });

  const getHandler = (path: string, method: 'post' | 'get') => {
    const route: any = authRoutes.stack.find(
      (layer: any) => layer.route && layer.route.path === path && layer.route.methods[method],
    );
    if (!route || !route.route) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found on authRoutes`);
    }
    return route.route.stack[route.route.stack.length - 1].handle;
  };

  describe('POST /login', () => {
    it('returns 400 VALIDATION_ERROR if email or password invalid', async () => {
      req.body = { email: 'invalid-email', password: 'short' };

      const handler = getHandler('/login', 'post');
      await handler(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
        }),
      );
      expect(mockLoginUser).not.toHaveBeenCalled();
    });

    it('returns 429 TOO_MANY_FAILED_LOGINS when user is rate limited', async () => {
      req.body = { email: 'locked@example.com', password: 'Password123!' };
      mockCheckFailedLoginLimit.mockResolvedValue({ isBlocked: true, attempts: 5 });

      const handler = getHandler('/login', 'post');
      await handler(req as Request, res as Response);

      expect(mockCheckFailedLoginLimit).toHaveBeenCalledWith('locked@example.com');
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'TOO_MANY_FAILED_LOGINS',
        message: 'Too many failed login attempts. Please try again later.',
      });
      expect(mockLoginUser).not.toHaveBeenCalled();
    });

    it('records failed attempt and returns 401 when login throwing invalid credentials', async () => {
      req.body = { email: 'user@example.com', password: 'WrongPassword123!' };
      mockLoginUser.mockRejectedValue(new Error('Invalid email or password'));

      const handler = getHandler('/login', 'post');
      await handler(req as Request, res as Response);

      expect(mockCheckFailedLoginLimit).toHaveBeenCalledWith('user@example.com');
      expect(mockRecordFailedLoginAttempt).toHaveBeenCalledWith('user@example.com');
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'LOGIN_FAILED',
        message: 'Invalid email or password',
      });
    });

    it('clears failed attempts and returns 200 on successful login', async () => {
      req.body = { email: 'user@example.com', password: 'CorrectPassword123!' };
      mockLoginUser.mockResolvedValue({
        user: { id: 'u-1', name: 'User', email: 'user@example.com' },
        organization: { id: 'org-1' },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const handler = getHandler('/login', 'post');
      await handler(req as Request, res as Response);

      expect(mockClearFailedLoginAttempts).toHaveBeenCalledWith('user@example.com');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'LOGIN_SUCCESS',
        message: 'Login successful',
        data: expect.objectContaining({
          accessToken: 'access-token',
        }),
      });
    });

    it('safely catches unexpected errors during checkFailedLoginLimit and returns 500', async () => {
      req.body = { email: 'user@example.com', password: 'Password123!' };
      mockCheckFailedLoginLimit.mockRejectedValue(new Error('Unexpected rate limit error'));

      const handler = getHandler('/login', 'post');
      await handler(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        code: 'LOGIN_ERROR',
        message: 'Unable to login',
      });
    });
  });

  describe('POST /register', () => {
    it('returns 400 VALIDATION_ERROR on missing fields', async () => {
      req.body = { name: 'A' };

      const handler = getHandler('/register', 'post');
      await handler(req as Request, res as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
        }),
      );
    });
  });
});
