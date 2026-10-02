import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../config/db';

type ResetRequestInput = {
  email: string;
};

type ResetPasswordInput = {
  token: string;
  newPassword: string;
};

const RESET_TOKEN_EXPIRY_MINUTES = 15;

const resetTokens = new Map<
  string,
  {
    userId: string;
    expiresAt: number;
  }
>();

export const requestPasswordReset = async (
  input: ResetRequestInput,
) => {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return {
      message: 'If an account exists with this email, a reset token has been generated',
    };
  }

  const token = crypto.randomBytes(32).toString('hex');

  resetTokens.set(token, {
    userId: user.id,
    expiresAt:
      Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000,
  });

  return {
    message: 'Password reset token generated',
    resetToken: token,
  };
};

export const resetPassword = async (
  input: ResetPasswordInput,
) => {
  const storedToken = resetTokens.get(input.token);

  if (!storedToken || storedToken.expiresAt < Date.now()) {
    resetTokens.delete(input.token);
    throw new Error('Invalid or expired password reset token');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);

  await prisma.user.update({
    where: {
      id: storedToken.userId,
    },
    data: {
      passwordHash,
    },
  });

  resetTokens.delete(input.token);

  return {
    message: 'Password reset successful',
  };
};