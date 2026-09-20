import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { env } from './lib/env.js';
import { errorHandler } from './lib/http-helpers.js';
import { adminRouter } from './routes/admin.js';
import { leadsRouter } from './routes/leads.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  app.use('/api', adminRouter);
  app.use('/api', leadsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API route' });
  });

  // Built UI, when there is one. In dev the Vite server proxies to this API instead.
  const indexHtml = path.join(env.webDistPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(env.webDistPath, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('text/plain')
        .send('Flowcalls API is running. Build the UI with `npm run build`, or start it with `npm run dev`.');
    });
  }

  app.use(errorHandler);
  return app;
}
