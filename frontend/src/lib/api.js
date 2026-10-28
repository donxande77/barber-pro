// Cliente HTTP da API. Envia o cookie de sessão e o token CSRF em toda alteração.
let csrfToken = null;
export const setCsrfToken = (token) => {
  csrfToken = token;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Não foi possível concluir a operação.');
    this.status = status;
    this.code = body?.error?.code;
    this.fields = body?.error?.fields ?? [];
  }
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { message: 'Sem conexão com o servidor.' } });
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  delete: (p) => request('DELETE', p),
};
