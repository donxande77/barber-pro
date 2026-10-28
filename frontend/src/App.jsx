import { Routes, Route, Link } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PublicHome from './pages/public/PublicHome.jsx';
import HomePage from './pages/admin/HomePage.jsx';
import UsersPage from './pages/admin/UsersPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/entrar" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/painel" element={<AdminLayout />}>
          <Route index element={<HomePage />} />
          <Route element={<ProtectedRoute permission="users:read" />}>
            <Route path="usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="font-heading text-6xl text-gold">404</p>
        <p className="mt-3 text-muted">Página não encontrada.</p>
        <Link to="/" className="btn-ghost mt-8">Ir para o início</Link>
      </div>
    </main>
  );
}
