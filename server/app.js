import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { appConfig } from './config/index.js';
import studyRoutes from './routes/studyRoutes.js';
import ingestionRoutes from './routes/ingestionRoutes.js';
import proposalRoutes from './routes/proposalRoutes.js';
import dlqRoutes from './routes/dlqRoutes.js';
import eventRoutes from './routes/eventRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: appConfig.appName,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/studies', studyRoutes);
  app.use('/api/ingest', ingestionRoutes);
  app.use('/api/ai-proposals', proposalRoutes);
  app.use('/api/dlq', dlqRoutes);
  app.use('/api/events', eventRoutes);
  app.use(express.static(path.join(__dirname, '../public')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  return app;
}