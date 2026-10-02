import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import {
  generateAccessToken,
  generateRefreshToken,
} from './auth.service';

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  organizationName: string;
};

export const registerUser = async (input: RegisterInput) => {
  const email = input.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error('An account with this email already exists');
  }

  const freePlan = await prisma.plan.findUnique({
    where: { name: 'Free' },
  });

  if (!freePlan) {
    throw new Error('Free plan is not configured');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
      },
    });

    await tx.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: freePlan.id,
        status: 'TRIALING',
      },
    });

    return {
      user,
      organization,
    };
  });

  const tokenPayload = {
    userId: result.user.id,
    organizationId: result.organization.id,
  };

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
    },
    organization: {
      id: result.organization.id,
      name: result.organization.name,
    },
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload),
  };
};