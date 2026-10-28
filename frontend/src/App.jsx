import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute.jsx';
import { SiteProvider } from './public/SiteContext.jsx';
import PublicLayout from './public/PublicLayout.jsx';
import HomePage from './public/HomePage.jsx';
import BookingPage from './public/BookingPage.jsx';
import { ManageBookingPage, ReviewPage, PrivacyPage } from './public/TokenPages.jsx';
import { MuralPage } from './public/Mural.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { Spinner } from './components/ui.jsx';

// O painel é carregado sob demanda: o site público fica leve no celular.
const AdminLayout = lazy(() => import('./layouts/AdminLayout.jsx'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage.jsx'));
const AgendaPage = lazy(() => import('./pages/admin/AgendaPage.jsx'));
const SalesListPage = lazy(() => import('./pages/admin/SalesPages.jsx').then((m) => ({ default: m.SalesListPage })));
const SaleDetailPage = lazy(() => import('./pages/admin/SalesPages.jsx').then((m) => ({ default: m.SaleDetailPage })));
const ClientsPage = lazy(() => import('./pages/admin/ClientsPage.jsx'));
const BarbersPage = lazy(() => import('./pages/admin/BarbersPage.jsx'));
const ServicesPage = lazy(() => import('./pages/admin/CatalogPages.jsx').then((m) => ({ default: m.ServicesPage })));
const ProductsPage = lazy(() => import('./pages/admin/CatalogPages.jsx').then((m) => ({ default: m.ProductsPage })));
const UnitsPage = lazy(() => import('./pages/admin/UnitsPage.jsx'));
const CompensationPage = lazy(() => import('./pages/admin/CompensationPage.jsx'));
const MyFinancePage = lazy(() => import('./pages/admin/CompensationPage.jsx').then((m) => ({ default: m.MyFinancePage })));
const FinancePage = lazy(() => import('./pages/admin/FinancePage.jsx'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage.jsx'));
const SiteEditorPage = lazy(() => import('./pages/admin/SiteEditorPage.jsx'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const ReviewsPage = lazy(() => import('./pages/admin/MiscPages.jsx').then((m) => ({ default: m.ReviewsPage })));
const AuditPage = lazy(() => import('./pages/admin/MiscPages.jsx').then((m) => ({ default: m.AuditPage })));
const MuralAdminPage = lazy(() => import('./pages/admin/MuralAdminPage.jsx'));
const PlansPage = lazy(() => import('./pages/admin/PlansPage.jsx'));
const AccountPage = lazy(() => import('./pages/admin/MiscPages.jsx').then((m) => ({ default: m.AccountPage })));

const guard = (permission, element) => (
  <Route element={<ProtectedRoute permission={permission} />}>{element}</Route>
);

export default function App() {
  return (
    <Suspense fallback={<div className="px-6"><Spinner /></div>}>
      <Routes>
        <Route element={<SiteProvider><PublicLayout /></SiteProvider>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/agendar" element={<BookingPage />} />
          <Route path="/mural" element={<MuralPage />} />
          <Route path="/agendamento/:token" element={<ManageBookingPage />} />
          <Route path="/avaliar/:token" element={<ReviewPage />} />
          <Route path="/privacidade" element={<PrivacyPage />} />
        </Route>
        <Route path="/entrar" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/painel" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="minha-conta" element={<AccountPage />} />
            {guard('appointments:read', <Route path="agenda" element={<AgendaPage />} />)}
            {guard('sales:manage', <><Route path="atendimentos" element={<SalesListPage />} /><Route path="atendimentos/:id" element={<SaleDetailPage />} /></>)}
            {guard('clients:read', <Route path="clientes" element={<ClientsPage />} />)}
            {guard('subscriptions:manage', <Route path="planos" element={<PlansPage />} />)}
            {guard('finance:own:read', <Route path="meu-financeiro" element={<MyFinancePage />} />)}
            {guard('barbers:manage', <Route path="barbeiros" element={<BarbersPage />} />)}
            {guard('catalog:manage', <Route path="servicos" element={<ServicesPage />} />)}
            {guard('stock:manage', <Route path="produtos" element={<ProductsPage />} />)}
            {guard('finance:unit:read', <Route path="financeiro" element={<FinancePage />} />)}
            {guard('payouts:manage', <Route path="remuneracao" element={<CompensationPage />} />)}
            {guard('reports:barber', <Route path="relatorios" element={<ReportsPage />} />)}
            {guard('mural:submit', <Route path="mural" element={<MuralAdminPage />} />)}
            {guard('reviews:moderate', <Route path="avaliacoes" element={<ReviewsPage />} />)}
            {guard('units:update', <Route path="unidades" element={<UnitsPage />} />)}
            {guard('site:manage', <Route path="site" element={<SiteEditorPage />} />)}
            {guard('users:read', <Route path="usuarios" element={<UsersPage />} />)}
            {guard('audit:read', <Route path="auditoria" element={<AuditPage />} />)}
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="font-heading text-7xl text-gold">404</p>
        <p className="mt-3 text-muted">Página não encontrada.</p>
        <Link to="/" className="btn-ghost mt-8">Ir para o início</Link>
      </div>
    </main>
  );
}
