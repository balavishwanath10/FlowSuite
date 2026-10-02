import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import membershipRoutes from './routes/membership.routes';

const app = express();

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/memberships', membershipRoutes);

app.listen(config.port, () => {
  console.log(
    `[FlowSuite Server] Running in ${config.nodeEnv} mode on port ${config.port}`,
  );
});