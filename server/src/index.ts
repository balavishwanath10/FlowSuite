import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import healthRoutes from './routes/health.routes';

const app = express();

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());

app.use('/api/v1', healthRoutes);

app.listen(config.port, () => {
  console.log(`[FlowSuite Server] Running in ${config.nodeEnv} mode on port ${config.port}`);
});
