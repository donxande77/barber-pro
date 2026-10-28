import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setCsrfToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', me: null });

  const apply = useCallback((me) => {
    setCsrfToken(me?.csrfToken ?? null);
    setState({ status: me ? 'authenticated' : 'anonymous', me });
  }, []);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(apply)
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
        apply(null);
      });
  }, [apply]);

  const login = useCallback(async (email, password) => apply(await api.post('/auth/login', { email, password })), [apply]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      apply(null);
    }
  }, [apply]);

  const value = useMemo(
    () => ({
      ...state,
      user: state.me?.user ?? null,
      company: state.me?.company ?? null,
      unitIds: state.me?.unitIds ?? [],
      // Apenas para exibir/ocultar itens da interface. A autorização real é sempre do backend.
      can: (perm) => Boolean(state.me?.permissions?.includes(perm)),
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
