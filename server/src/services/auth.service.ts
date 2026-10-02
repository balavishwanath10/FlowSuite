import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env';

export type TokenPayload = {
  userId: string;
  organizationId: string;
};

const accessTokenOptions: SignOptions = {
  expiresIn: config.jwtAccessExpiresIn as SignOptions['expiresIn'],
};

const refreshTokenOptions: SignOptions = {
  expiresIn: config.jwtRefreshExpiresIn as SignOptions['expiresIn'],
};

export const generateAccessToken = (payload: TokenPayload): string => {
  if (!config.jwtAccessSecret) {
    throw new Error('JWT access secret is not configured');
  }

  return jwt.sign(payload, config.jwtAccessSecret, accessTokenOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  if (!config.jwtRefreshSecret) {
    throw new Error('JWT refresh secret is not configured');
  }

  return jwt.sign(payload, config.jwtRefreshSecret, refreshTokenOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  if (!config.jwtAccessSecret) {
    throw new Error('JWT access secret is not configured');
  }

  return jwt.verify(token, config.jwtAccessSecret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  if (!config.jwtRefreshSecret) {
    throw new Error('JWT refresh secret is not configured');
  }

  return jwt.verify(token, config.jwtRefreshSecret) as TokenPayload;
};