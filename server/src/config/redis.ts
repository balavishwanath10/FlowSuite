import Redis from 'ioredis';
import { config } from './env';

export const redis = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
