import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import membershipRoutes from './routes/membership.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import customerRoutes from './routes/customer.routes';
import auditLogRoutes from './routes/audit-log.routes';
import subscriptionRoutes from './routes/subscription.routes';
import usageRoutes from './routes/usage.routes';

const app = express();

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());

app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/memberships', membershipRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/audit-logs', auditLogRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/usage', usageRoutes);

app.listen(config.port, () => {
  console.log(
    `[FlowSuite Server] Running in ${config.nodeEnv} mode on port ${config.port}`,
  );
});