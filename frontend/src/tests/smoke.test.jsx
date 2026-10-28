// @vitest-environment jsdom
// Teste de fumaça: renderiza cada tela com os dados reais capturados da demonstração
// e falha se alguma tela quebrar (erro de execução) ou não mostrar o conteúdo esperado.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext.jsx';
import App from '../App.jsx';
import { installMockApi } from '../preview/mockApi.js';

beforeAll(async () => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  installMockApi();
  // login da demonstração
  await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'dono@demo.barberpro', password: 'Demo2026senha' }) });
});

function renderAt(path) {
  const errors = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><App /></AuthProvider>
    </MemoryRouter>,
  );
  return { errors, restore: () => spy.mockRestore() };
}

const cases = [
  ['/', /Serviços e preços/],
  ['/agendar', /Agendar horário/],
  ['/privacidade', /Privacidade/],
  ['/mural', /Mural de cortes/],
  ['/painel/mural', /Mural de cortes/],
  ['/painel', /Visão da empresa/],
  ['/painel/agenda', /Agenda/],
  ['/painel/atendimentos', /Atendimentos e vendas/],
  ['/painel/clientes', /Clientes/],
  ['/painel/barbeiros', /Barbeiros/],
  ['/painel/servicos', /Serviços e preços/],
  ['/painel/produtos', /Produtos e estoque/],
  ['/painel/financeiro', /Financeiro/],
  ['/painel/remuneracao', /Remuneração/],
  ['/painel/relatorios', /Relatórios/],
  ['/painel/avaliacoes', /Avaliações/],
  ['/painel/unidades', /Unidades/],
  ['/painel/site', /Site e aparência/],
  ['/painel/usuarios', /Usuários/],
  ['/painel/auditoria', /Auditoria/],
  ['/painel/minha-conta', /Minha conta/],
];

describe('telas renderizam sem erro', () => {
  for (const [path, text] of cases) {
    it(path, async () => {
      const { errors, restore } = renderAt(path);
      await waitFor(() => expect(screen.getAllByText(text).length).toBeGreaterThan(0), { timeout: 4000 });
      await new Promise((r) => setTimeout(r, 400)); // deixa as buscas terminarem
      const alerts = screen.queryAllByRole('alert').map((a) => a.textContent);
      restore();
      cleanup();
      const real = errors.filter((e) => !/width\(0\) and height\(0\)|act\(|The width|not wrapped in act/.test(e));
      expect(real, real.join('\n')).toEqual([]);
      expect(alerts, `alertas na tela: ${alerts.join(' | ')}`).toEqual([]);
    });
  }
});

describe('dados aparecem', () => {
  it('painel do proprietário mostra indicadores reais', async () => {
    renderAt('/painel');
    await waitFor(() => expect(screen.getAllByText(/Resultado operacional/).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(document.body.textContent).toMatch(/R\$\s?[\d.]+,\d{2}/);
    cleanup();
  });
  it('detalhe de venda abre com itens e pagamentos', async () => {
    const { default: fx } = await import('../preview/fixtures.json');
    const saleKey = Object.keys(fx.routes).find((k) => /^\/sales\/[0-9a-f-]{36}$/.test(k));
    renderAt(saleKey.replace('/sales/', '/painel/atendimentos/'));
    await waitFor(() => expect(screen.getAllByText(/Pagamentos/).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.queryAllByRole('alert')).toEqual([]);
    cleanup();
  });
  it('site público pede a unidade e depois lista serviços com preço', async () => {
    renderAt('/');
    const unitBtn = await screen.findAllByRole('radio', { name: /Centro/ }, { timeout: 4000 });
    fireEvent.click(unitBtn[0]);
    await waitFor(() => expect(screen.getAllByText(/Degradê/).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(document.body.textContent).toMatch(/R\$\s?55,00/);
    cleanup();
  });
});

describe('mural de cortes', () => {
  it('abre o corte e leva ao agendamento com a referência e os serviços marcados', async () => {
    renderAt('/mural');
    const card = await screen.findByRole('button', { name: /Ver Alinhamento com volume controlado/ }, { timeout: 4000 });
    fireEvent.click(card);
    const want = await screen.findByRole('button', { name: /Quero este corte/ });
    fireEvent.click(want);
    await waitFor(() => expect(screen.getAllByText(/Corte de referência/).length).toBeGreaterThan(0), { timeout: 4000 });
    await waitFor(() => expect(document.body.textContent).toMatch(/Alinhamento capilar/), { timeout: 4000 });
    const pressed = screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent);
    expect(pressed.join(' ')).toMatch(/Alinhamento capilar/);
    expect(pressed.join(' ')).toMatch(/Degradê/);
    cleanup();
  });
});
