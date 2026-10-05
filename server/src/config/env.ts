import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/flowsuite?schema=public',

  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
  stripeStarterPriceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter_test',
  stripeProfessionalPriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_prof_test',
};