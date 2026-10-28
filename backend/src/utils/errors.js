export class AppError extends Error {
  /**
   * @param {number} status código HTTP
   * @param {string} code identificador estável para o frontend
   * @param {string} message mensagem amigável em português
   * @param {unknown} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg = 'Requisição inválida.', details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Faça login para continuar.') => new AppError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Registro não encontrado.') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg = 'Conflito com dados existentes.', details) => new AppError(409, 'CONFLICT', msg, details);
export const tooMany = (msg = 'Muitas tentativas. Aguarde e tente novamente.') => new AppError(429, 'TOO_MANY_REQUESTS', msg);
