/**
 * Cria um controller fino: chama o serviço com (ctx, dadosValidados) e responde em JSON.
 * Mantém as regras de negócio nos serviços e os controllers sem lógica.
 */
export const handle =
  (fn, status = 200) =>
  async (req, res) => {
    const result = await fn(req.ctx, req.valid ?? {}, req);
    if (status === 204 || result === undefined) return res.status(204).end();
    res.status(status).json(result);
  };
