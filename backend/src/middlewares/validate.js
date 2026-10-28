/**
 * Valida body, params e query com Zod. Os dados validados ficam em req.valid
 * (no Express 5, req.query é somente leitura, então não sobrescrevemos).
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const key of ['params', 'query', 'body']) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {});
  }
  next();
};
