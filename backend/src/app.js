import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { loadSession } from './middlewares/auth.js';
import { csrfProtection, requireJson } from './middlewares/csrf.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';
import { router } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY); // >0 apenas atrás de proxy reverso confiável (Nginx, Render…)

  // ── API ──
  const apiHelmet = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, // a API só responde JSON
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  const apiCors = cors({
    origin(origin, cb) {
      // Sem Origin = mesmo site, curl ou servidor. Com Origin, só as da lista.
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });
  app.use('/api', apiHelmet, apiCors);
  app.use('/api/uploads', express.json({ limit: '8mb' })); // imagens em base64
  app.use('/api', express.json({ limit: '200kb' }), cookieParser(), requireJson, loadSession, csrfProtection, router);
  app.use('/api', notFoundHandler);

  // ── Imagens enviadas pelo painel ──
  app.use(
    '/uploads',
    helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], imgSrc: ["'self'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' } }),
    express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }),
  );

  // ── Frontend (produção): a mesma origem serve o site e a API ──
  if (env.FRONTEND_DIST && fs.existsSync(path.join(env.FRONTEND_DIST, 'index.html'))) {
    const dist = path.resolve(env.FRONTEND_DIST);
    const siteHelmet = helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
    });
    app.use(siteHelmet, express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/).*/, siteHelmet, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
