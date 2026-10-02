import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import {
  generateAccessToken,
  generateRefreshToken,
} from './auth.service';

type LoginInput = {
  email: string;
  password: string;
};

export const loginUser = async (input: LoginInput) => {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new Error('Invalid email or password');
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
    },
  });

  if (!membership) {
    throw new Error('User organization membership not found');
  }

  const tokenPayload = {
    userId: user.id,
    organizationId: membership.organizationId,
  };

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    organization: {
      id: membership.organizationId,
    },
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload),
  };
};