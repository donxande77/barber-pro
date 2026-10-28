import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

const PREVIEW = import.meta.env.VITE_PREVIEW === '1';

async function start() {
  let Router = BrowserRouter;
  if (PREVIEW) {
    // Pré-visualização sem servidor: API simulada em memória e roteamento interno.
    const { installMockApi } = await import('./preview/mockApi.js');
    installMockApi();
    Router = MemoryRouter;
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {PREVIEW && <PreviewBanner />}
      <Router>
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </StrictMode>,
  );
}

function PreviewBanner() {
  return (
    <div className="bg-gold px-4 py-1.5 text-center text-xs font-semibold text-gold-contrast">
      Demonstração com dados fictícios — nada é salvo. Painel: dono@demo.barberpro · Demo2026senha
    </div>
  );
}

start();
