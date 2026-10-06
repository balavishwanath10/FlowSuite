import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { registerUser } from '../services/registration.service';
import { loginUser } from '../services/login.service';
import {
  authenticate,
  AuthenticatedRequest,
} from '../middleware/auth.middleware';

import { refreshAccessToken } from '../services/refresh.service';

import {
  requestPasswordReset,
  resetPassword,
} from '../services/password-reset.service';

import {
  checkFailedLoginLimit,
  clearFailedLoginAttempts,
  recordFailedLoginAttempt,
} from '../services/login-rate-limit.service';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

router.post('/register', async (req: Request, res: Response) => {
  const validation = registerSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid registration data',
      errors: validation.error.issues,
    });
  }

  try {
    const result = await registerUser(validation.data);

    return res.status(201).json({
      code: 'REGISTRATION_SUCCESS',
      message: 'Account registered successfully',
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Registration failed';

    if (message === 'An account with this email already exists') {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        message,
      });
    }

    if (message === 'Free plan is not configured') {
      return res.status(500).json({
        code: 'PLAN_CONFIGURATION_ERROR',
        message,
      });
    }

    console.error('Registration error:', error);

    return res.status(500).json({
      code: 'REGISTRATION_ERROR',
      message: 'Unable to register account',
    });
  }
});



router.post('/login', async (req: Request, res: Response) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid login data',
      errors: validation.error.issues,
    });
  }

  const email = validation.data.email.trim().toLowerCase();

  try {
    const limitCheck = await checkFailedLoginLimit(email);
    if (limitCheck.isBlocked) {
      return res.status(429).json({
        code: 'TOO_MANY_FAILED_LOGINS',
        message: 'Too many failed login attempts. Please try again later.',
      });
    }

    const result = await loginUser(validation.data);
    await clearFailedLoginAttempts(email);

    return res.status(200).json({
      code: 'LOGIN_SUCCESS',
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Login failed';

    if (
      message === 'Invalid email or password' ||
      message === 'User organization membership not found'
    ) {
      await recordFailedLoginAttempt(email);

      return res.status(401).json({
        code: 'LOGIN_FAILED',
        message: 'Invalid email or password',
      });
    }

    console.error('Login error:', error);

    return res.status(500).json({
      code: 'LOGIN_ERROR',
      message: 'Unable to login',
    });
  }
});

router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    code: 'AUTHENTICATED',
    message: 'Authenticated request successful',
    data: {
      userId: req.user?.userId,
      organizationId: req.user?.organizationId,
    },
  });
});

router.post('/refresh', (req: Request, res: Response) => {
  const validation = refreshSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid refresh token data',
      errors: validation.error.issues,
    });
  }

  try {
    const result = refreshAccessToken(validation.data);

    return res.status(200).json({
      code: 'TOKEN_REFRESH_SUCCESS',
      message: 'Access token refreshed successfully',
      data: result,
    });
  } catch {
    return res.status(401).json({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid or expired refresh token',
    });
  }
});

router.post('/logout', authenticate, (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    code: 'LOGOUT_SUCCESS',
    message: 'Logout successful',
  });
});

router.post('/password-reset/request', async (req: Request, res: Response) => {
  const validation = passwordResetRequestSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid password reset request',
      errors: validation.error.issues,
    });
  }

  try {
    const result = await requestPasswordReset(validation.data);

    return res.status(200).json({
      code: 'PASSWORD_RESET_REQUESTED',
      message: result.message,
      data: 'resetToken' in result ? { resetToken: result.resetToken } : undefined,
    });
  } catch (error) {
    console.error('Password reset request error:', error);

    return res.status(500).json({
      code: 'PASSWORD_RESET_ERROR',
      message: 'Unable to process password reset request',
    });
  }
});

router.post('/password-reset', async (req: Request, res: Response) => {
  const validation = passwordResetSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid password reset data',
      errors: validation.error.issues,
    });
  }

  try {
    const result = await resetPassword(validation.data);

    return res.status(200).json({
      code: 'PASSWORD_RESET_SUCCESS',
      message: result.message,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to reset password';

    if (message === 'Invalid or expired password reset token') {
      return res.status(401).json({
        code: 'INVALID_RESET_TOKEN',
        message,
      });
    }

    console.error('Password reset error:', error);

    return res.status(500).json({
      code: 'PASSWORD_RESET_ERROR',
      message: 'Unable to reset password',
    });
  }
});

export default router;