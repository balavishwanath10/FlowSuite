import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = `error: ${(err as Error).message}`;
  }

  try {
    if (redis.status !== 'ready' && redis.status !== 'connecting') {
      await redis.connect();
    }
    const pingRes = await redis.ping();
    if (pingRes === 'PONG') {
      redisStatus = 'connected';
    }
  } catch (err) {
    redisStatus = `error: ${(err as Error).message}`;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      server: 'healthy',
      database: dbStatus,
      redis: redisStatus,
    },
  });
});

export default router;
