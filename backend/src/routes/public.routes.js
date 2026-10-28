import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { validate as V } from '../middlewares/validate.js';
import { unitParams } from '../validators/common.js';
import * as ov from '../validators/ops.validators.js';
import { publicCtl } from '../controllers/public.controller.js';

export const publicRoutes = Router();

const limit = (max) =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler: (_req, res) => res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Muitas solicitações. Aguarde alguns minutos.' } }),
  });

publicRoutes.get('/site', publicCtl.site);
publicRoutes.get('/units/:unitId/catalog', V({ params: unitParams }), publicCtl.catalog);
publicRoutes.get('/availability', limit(300), V({ query: ov.availabilityQuery }), publicCtl.availability);
publicRoutes.post('/appointments', limit(env.PUBLIC_BOOKING_RATE_LIMIT_PER_15MIN), V({ body: ov.publicBookingBody }), publicCtl.book);
publicRoutes.get('/appointments/:token', limit(60), V({ params: ov.tokenParams }), publicCtl.manageInfo);
publicRoutes.post('/appointments/:token/cancel', limit(20), V({ params: ov.tokenParams, body: ov.cancelByClientBody }), publicCtl.manageCancel);
publicRoutes.get('/reviews/:token', limit(60), V({ params: ov.tokenParams }), publicCtl.reviewInfo);
publicRoutes.post('/reviews/:token', limit(20), V({ params: ov.tokenParams, body: ov.reviewBody }), publicCtl.submitReview);
