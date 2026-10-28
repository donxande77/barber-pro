import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export function ProtectedRoute({ permission }) {
  const { status, can } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center text-muted" role="status">
        Carregando…
      </div>
    );
  }
  if (status !== 'authenticated') return <Navigate to="/entrar" replace state={{ from: location }} />;
  if (permission && !can(permission)) return <Navigate to="/painel" replace />;
  return <Outlet />;
}
