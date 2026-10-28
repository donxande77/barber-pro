import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { applyTheme } from '../lib/theme.js';

const SiteContext = createContext(null);
const UNIT_KEY = 'bp_unit';

const readUnit = () => {
  try {
    return localStorage.getItem(UNIT_KEY);
  } catch {
    return null;
  }
};

/**
 * Dados do site público: configuração publicada, unidades e a unidade escolhida pelo visitante.
 * Com ?preview=draft, o proprietário logado vê o rascunho antes de publicar.
 */
export function SiteProvider({ children }) {
  const [site, setSite] = useState(null);
  const [error, setError] = useState(null);
  const [isPreview, setIsPreview] = useState(false);
  const [unitId, setUnitIdState] = useState(readUnit);
  const [catalog, setCatalog] = useState({ unitId: null, data: null, loading: false, error: null });
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.get('/public/site');
        if (new URLSearchParams(window.location.search).get('preview') === 'draft') {
          try {
            const draft = await api.get('/site/draft');
            if (draft?.data) {
              data.config = draft.data;
              if (alive) setIsPreview(true);
            }
          } catch {
            /* sem permissão: mostra o publicado */
          }
        }
        if (!alive) return;
        api.get('/public/plans').then((p) => alive && setPlans(p)).catch(() => {}); // planos são opcionais no site
        applyTheme(data.config);
        document.title = data.config.brand.name;
        setSite(data);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Se só existe uma unidade, ela já vem escolhida; unidade salva que não existe mais é descartada.
  const units = site?.units ?? [];
  const effectiveUnitId = units.length === 1 ? units[0].id : units.some((u) => u.id === unitId) ? unitId : null;

  const setUnitId = useCallback((id) => {
    setUnitIdState(id);
    try {
      if (id) localStorage.setItem(UNIT_KEY, id);
      else localStorage.removeItem(UNIT_KEY);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  useEffect(() => {
    if (!effectiveUnitId || catalog.unitId === effectiveUnitId) return;
    setCatalog({ unitId: effectiveUnitId, data: null, loading: true, error: null });
    api
      .get(`/public/units/${effectiveUnitId}/catalog`)
      .then((data) => setCatalog({ unitId: effectiveUnitId, data, loading: false, error: null }))
      .catch((e) => setCatalog({ unitId: effectiveUnitId, data: null, loading: false, error: e }));
  }, [effectiveUnitId, catalog.unitId]);

  const value = useMemo(
    () => ({
      site,
      error,
      isPreview,
      config: site?.config,
      units,
      unit: units.find((u) => u.id === effectiveUnitId) ?? null,
      unitId: effectiveUnitId,
      setUnitId,
      catalog: catalog.unitId === effectiveUnitId ? catalog : { data: null, loading: !!effectiveUnitId, error: null },
      // Planos válidos na unidade escolhida (ou todos, antes de escolher)
      plans: plans.filter((p) => !p.unit || !effectiveUnitId || p.unit.id === effectiveUnitId),
    }),
    [site, error, isPreview, units, effectiveUnitId, setUnitId, catalog, plans],
  );
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
