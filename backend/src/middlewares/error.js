import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Rota não encontrada.'));
}

 
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Verifique os dados informados.',
        fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  // Erros de JSON malformado do express.json()
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Conteúdo muito grande.' } });
  }

  // Restrições do PostgreSQL / Prisma
  const pgCode = err?.cause?.code ?? err?.meta?.driverAdapterError?.cause?.originalCode ?? err?.code;
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Já existe um registro com estes dados.' } });
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' } });
  }
  if (isExclusionViolation(err) || pgCode === '23P01') {
    return res.status(409).json({ error: { code: 'SCHEDULE_CONFLICT', message: 'Horário indisponível: já existe um agendamento neste intervalo.' } });
  }

  if (!env.isTest || process.env.DEBUG_ERRORS) console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
}

export function isExclusionViolation(err) {
  const text = `${err?.message ?? ''} ${JSON.stringify(err?.meta ?? {})}`;
  return text.includes('23P01') || text.includes('Appointment_barber_no_overlap') || text.includes('exclusion constraint');
}
