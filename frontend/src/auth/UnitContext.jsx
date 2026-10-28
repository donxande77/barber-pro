import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const UnitContext = createContext(null);
const KEY = 'bp_admin_unit';

/** Unidade em foco no painel (o usuário só vê as do seu escopo). */
export function UnitProvider({ children }) {
  const { status } = useAuth();
  const [units, setUnits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [unitId, setUnitIdState] = useState(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });

  const reload = useCallback(async () => {
    try {
      setUnits(await api.get('/units'));
    } catch {
      setUnits([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') reload();
  }, [status, reload]);

  const setUnitId = useCallback((id) => {
    setUnitIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* indisponível */
    }
  }, []);

  const effective = units.some((u) => u.id === unitId) ? unitId : units[0]?.id ?? null;
  const value = useMemo(
    () => ({ units, unitId: effective, unit: units.find((u) => u.id === effective) ?? null, setUnitId, reload, loaded }),
    [units, effective, setUnitId, reload, loaded],
  );
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export const useUnit = () => useContext(UnitContext);

export function UnitSelect({ allowAll = false, value, onChange, className = 'input py-2' }) {
  const ctx = useUnit();
  const v = value !== undefined ? value : ctx.unitId ?? '';
  const set = onChange ?? ctx.setUnitId;
  if (!ctx.units.length) return null;
  return (
    <select className={className} value={v} onChange={(e) => set(e.target.value)} aria-label="Unidade">
      {allowAll && <option value="">Todas as unidades</option>}
      {ctx.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}
