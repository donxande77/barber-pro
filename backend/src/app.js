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

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, // a API só responde JSON
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Sem Origin = chamada do mesmo site, curl ou servidor. Com Origin, só as da lista.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.use('/api', requireJson, loadSession, csrfProtection, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
