// Relatórios: os mesmos dados viram JSON (tela/impressão A4), CSV, Excel e PDF.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { forbidden, notFound } from '../utils/errors.js';
import { formatLocal, periodRange } from '../utils/time.js';
import { barberStatement, MODEL_LABELS } from './compensation.service.js';
import { consolidated, financeSummary } from './finance.service.js';
import { getPublishedConfig } from './site.service.js';

const brl = (v) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateBR = (iso) => iso.split('-').reverse().join('/');

const TX_LABELS = {
  SALE_PAYMENT: 'Recebimento de venda', INCOME: 'Receita', EXPENSE: 'Despesa', BILL_PAYMENT: 'Conta paga', BILL_RECEIPT: 'Conta recebida',
  BARBER_PAYOUT: 'Pagamento a profissional', CHAIR_RENT_RECEIPT: 'Aluguel de cadeira', TRANSFER_IN: 'Transferência recebida',
  TRANSFER_OUT: 'Transferência enviada', ADJUSTMENT: 'Ajuste', REVERSAL: 'Estorno', OPENING_BALANCE: 'Saldo inicial',
};
const OB_LABELS = { COMMISSION: 'Comissão', FIXED_SALARY: 'Remuneração fixa', CHAIR_RENTAL: 'Aluguel de cadeira', BONUS: 'Bônus', ADJUSTMENT: 'Ajuste' };

/**
 * Estrutura comum a todos os relatórios:
 * { title, subtitle, filters[], kpis[[rótulo, valor]], tables[{ title, columns[{key,label,money?}], rows[], totals? }] }
 */
async function header(ctx) {
  const company = await prisma.company.findUnique({ where: { id: ctx.user.companyId } });
  const config = await getPublishedConfig(company.id);
  return { company: company.name, logoUrl: config.brand.logoUrl, generatedAt: new Date().toISOString(), generatedBy: ctx.user.name };
}

export async function barberReport(ctx, q) {
  const st = await barberStatement(ctx, q);
  const unitName = q.unitId ? (await prisma.unit.findUnique({ where: { id: q.unitId } }))?.name : 'Todas as unidades';
  const s = st.summary;
  return {
    ...(await header(ctx)),
    kind: 'barber',
    title: `Relatório individual — ${st.barber.name}`,
    subtitle: `Período ${dateBR(q.from)} a ${dateBR(q.to)}`,
    filters: [['Profissional', st.barber.name], ['Unidade', unitName], ['Vínculos', st.barber.units.map((u) => `${u.name} (${MODEL_LABELS[u.model]})`).join(', ')]],
    kpis: [
      ['Serviços realizados', String(s.servicesCount)], ['Produtos vendidos', String(s.productsCount)],
      ['Faturamento atribuído', brl(s.revenue)], ['Descontos', brl(s.discounts)],
      ['Comissões geradas', brl(s.commissions)], ['Remuneração fixa', brl(s.fixed)],
      ['Bônus', brl(s.bonuses)], ['Ajustes', brl(s.adjustments)],
      ['Total calculado', brl(s.calculated)], ['Devido', brl(s.due)],
      ['Pago', brl(s.paid)], ['Pendente', brl(s.pending)],
      ['Aguardando recebimento do cliente', brl(s.notYetDue)], ['Pendências anteriores', brl(s.pendingBefore)],
      ['Aluguel de cadeira devido', brl(s.chairRentDue)], ['Aluguel de cadeira pago', brl(s.chairRentPaid)],
    ],
    tables: [
      {
        title: 'Serviços e vendas',
        columns: [
          { key: 'date', label: 'Data' }, { key: 'unit', label: 'Unidade' }, { key: 'description', label: 'Item' },
          { key: 'quantity', label: 'Qtd' }, { key: 'total', label: 'Valor', money: true }, { key: 'commissionPct', label: 'Comissão %' },
          { key: 'commissionAmount', label: 'Comissão', money: true },
        ],
        rows: st.items.map((i) => ({ ...i, date: formatLocal(i.date, 'America/Sao_Paulo', 'dd/MM/yyyy'), commissionPct: i.commissionPct ? `${Number(i.commissionPct).toFixed(2)}%` : '—' })),
        totals: { total: s.revenue, commissionAmount: s.commissions },
      },
      {
        title: 'Lançamentos (calculado, pago e pendente)',
        columns: [
          { key: 'date', label: 'Data' }, { key: 'type', label: 'Tipo' }, { key: 'description', label: 'Descrição' },
          { key: 'amount', label: 'Valor', money: true }, { key: 'settledAmount', label: 'Pago', money: true },
          { key: 'pending', label: 'Pendente', money: true }, { key: 'state', label: 'Situação' },
        ],
        rows: st.obligations.map((o) => ({
          date: formatLocal(o.createdAt, 'America/Sao_Paulo', 'dd/MM/yyyy'), type: OB_LABELS[o.type], description: o.description ?? '',
          amount: o.amount, settledAmount: o.settledAmount, pending: o.pending,
          state: o.status === 'CANCELLED' ? 'Cancelado' : o.status === 'SETTLED' ? 'Quitado' : o.due ? 'Devido' : 'Aguardando cliente',
        })),
      },
      {
        title: 'Pagamentos realizados',
        columns: [{ key: 'date', label: 'Data' }, { key: 'unit', label: 'Unidade' }, { key: 'account', label: 'Conta' }, { key: 'kind', label: 'Tipo' }, { key: 'amount', label: 'Valor', money: true }],
        rows: st.payouts.map((p) => ({
          date: formatLocal(p.paidAt, 'America/Sao_Paulo', 'dd/MM/yyyy'), unit: p.unit.name, account: p.account.name,
          kind: p.direction === 'PAYABLE_TO_BARBER' ? 'Pago ao profissional' : 'Aluguel recebido', amount: p.amount,
        })),
      },
    ],
  };
}

function summaryKpis(s) {
  return [
    ['Faturamento (vendas fechadas)', brl(s.revenue)], ['Número de vendas', String(s.salesCount)],
    ['Recebimentos', brl(s.receipts)], ['Outras receitas', brl(s.otherIncome)],
    ['Despesas', brl(s.expenses)], ['Pagamentos a profissionais', brl(s.payouts)],
    ['Resultado operacional (caixa)', brl(s.operatingResult)], ['Ajustes', brl(s.adjustments)],
    ['Custo dos produtos vendidos', brl(s.cogs)], ['Comissões do período', brl(s.commissionsAccrued)],
    ['Pendente com profissionais', brl(s.pendingToBarbers)], ['Contas a pagar em aberto', brl(s.payablesOpen)],
    ['Contas a receber em aberto', brl(s.receivablesOpen)],
  ];
}

export async function unitReport(ctx, q) {
  if (!ctx.unitIds.includes(q.unitId)) throw forbidden('Unidade fora do seu acesso.');
  const unit = await prisma.unit.findUnique({ where: { id: q.unitId } });
  if (!unit) throw notFound('Unidade não encontrada.');
  const fs_ = await financeSummary(ctx, q);
  const { start, end } = periodRange(q.from, q.to, unit.timezone);
  const txs = await prisma.financialTransaction.findMany({
    where: { unitId: q.unitId, occurredAt: { gte: start, lt: end } },
    include: { account: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: { occurredAt: 'asc' },
  });
  const items = await prisma.$queryRaw`
    SELECT i.kind::text AS kind, i.description AS name, SUM(i.quantity)::int AS qty, SUM(i.total) AS revenue
    FROM "SaleItem" i JOIN "Sale" s ON s.id = i."saleId"
    WHERE s.status = 'CLOSED' AND s."unitId" = ${q.unitId}::uuid AND s."closedAt" >= ${start} AND s."closedAt" < ${end}
    GROUP BY 1, 2 ORDER BY 4 DESC`;
  return {
    ...(await header(ctx)),
    kind: 'unit',
    title: `Relatório da unidade — ${unit.name}`,
    subtitle: `Período ${dateBR(q.from)} a ${dateBR(q.to)}`,
    filters: [['Unidade', unit.name], ...(q.method ? [['Forma de pagamento', q.method]] : [])],
    kpis: [...summaryKpis(fs_.summary), ['Saldo disponível nas contas', brl(fs_.available)]],
    tables: [
      {
        title: 'Saldos por conta',
        columns: [{ key: 'name', label: 'Conta' }, { key: 'type', label: 'Tipo' }, { key: 'balance', label: 'Saldo', money: true }],
        rows: fs_.accounts.map((a) => ({ name: a.name, type: a.type, balance: a.balance })),
        totals: { balance: fs_.available },
      },
      {
        title: 'Serviços e produtos',
        columns: [{ key: 'kind', label: 'Tipo' }, { key: 'name', label: 'Item' }, { key: 'qty', label: 'Qtd' }, { key: 'revenue', label: 'Faturamento', money: true }],
        rows: items.map((r) => ({ kind: r.kind === 'SERVICE' ? 'Serviço' : 'Produto', name: r.name, qty: r.qty, revenue: Number(r.revenue).toFixed(2) })),
      },
      {
        title: 'Movimentações',
        columns: [
          { key: 'date', label: 'Data' }, { key: 'kind', label: 'Natureza' }, { key: 'description', label: 'Descrição' },
          { key: 'account', label: 'Conta' }, { key: 'in', label: 'Entrada', money: true }, { key: 'out', label: 'Saída', money: true },
        ],
        rows: txs.map((t) => ({
          date: formatLocal(t.occurredAt, unit.timezone), kind: TX_LABELS[t.kind], description: [t.description, t.category?.name].filter(Boolean).join(' · '),
          account: t.account.name, in: t.direction === 'IN' ? t.amount : '', out: t.direction === 'OUT' ? t.amount : '',
        })),
      },
    ],
  };
}

export async function consolidatedReport(ctx, q) {
  const c = await consolidated(ctx, q);
  const obligations = await prisma.$queryRaw`
    SELECT b.name, SUM(o.amount - o."settledAmount") AS pending
    FROM "BarberObligation" o JOIN "Barber" b ON b.id = o."barberId"
    WHERE o.status IN ('OPEN', 'PARTIAL') AND o.direction = 'PAYABLE_TO_BARBER' AND b."companyId" = ${ctx.user.companyId}::uuid
    GROUP BY b.name ORDER BY 2 DESC`;
  return {
    ...(await header(ctx)),
    kind: 'consolidated',
    title: 'Relatório consolidado da empresa',
    subtitle: `Período ${dateBR(q.from)} a ${dateBR(q.to)}`,
    filters: [['Unidades', `${c.perUnit.length}`], ...(q.method ? [['Forma de pagamento', q.method]] : [])],
    kpis: [
      ...summaryKpis(c.total),
      ['Saldo disponível (todas as contas)', brl(c.available)],
      ['Transferências internas eliminadas', `${c.internalTransfers.count} · ${brl(c.internalTransfers.amount)}`],
    ],
    tables: [
      {
        title: 'Comparativo entre unidades',
        columns: [
          { key: 'unit', label: 'Unidade' }, { key: 'revenue', label: 'Faturamento', money: true }, { key: 'receipts', label: 'Recebimentos', money: true },
          { key: 'otherIncome', label: 'Outras receitas', money: true }, { key: 'expenses', label: 'Despesas', money: true },
          { key: 'operatingResult', label: 'Resultado', money: true },
        ],
        rows: c.perUnit.map((u) => ({ ...u, unit: u.unit.name })),
        totals: { revenue: c.total.revenue, receipts: c.total.receipts, otherIncome: c.total.otherIncome, expenses: c.total.expenses, operatingResult: c.total.operatingResult },
      },
      {
        title: 'Transferências internas (não entram em receitas nem despesas)',
        columns: [{ key: 'date', label: 'Data' }, { key: 'from', label: 'De' }, { key: 'to', label: 'Para' }, { key: 'amount', label: 'Valor', money: true }, { key: 'state', label: 'Situação' }],
        rows: c.internalTransfers.items.map((t) => ({ ...t, date: formatLocal(t.occurredAt, 'America/Sao_Paulo', 'dd/MM/yyyy'), state: t.reversed ? 'Estornada' : 'Efetivada' })),
      },
      {
        title: 'Saldos por conta',
        columns: [{ key: 'unit', label: 'Unidade' }, { key: 'name', label: 'Conta' }, { key: 'balance', label: 'Saldo', money: true }],
        rows: c.accounts.map((a) => ({ unit: a.unit.name, name: a.name, balance: a.balance })),
        totals: { balance: c.available },
      },
      {
        title: 'Obrigações com profissionais (pendentes)',
        columns: [{ key: 'name', label: 'Profissional' }, { key: 'pending', label: 'Pendente', money: true }],
        rows: obligations.map((o) => ({ name: o.name, pending: Number(o.pending).toFixed(2) })),
        totals: { pending: c.total.pendingToBarbers },
      },
    ],
  };
}

// ── Exportações ──

const cell = (row, col) => {
  const v = row[col.key];
  if (v === null || v === undefined) return '';
  return col.money && v !== '' ? Number(v).toFixed(2) : String(v);
};

/** CSV compatível com Excel em português (separador ";", BOM UTF-8, vírgula decimal). */
export function toCsv(report) {
  const esc = (v) => {
    const s = String(v ?? '');
    // Neutraliza fórmulas (CSV injection)
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [[report.company], [report.title], [report.subtitle], ...report.filters, [`Gerado em ${formatLocal(new Date(report.generatedAt), 'America/Sao_Paulo')}`], [], ...report.kpis, []];
  for (const t of report.tables) {
    lines.push([t.title]);
    lines.push(t.columns.map((c) => c.label));
    for (const r of t.rows) lines.push(t.columns.map((c) => (c.money ? cell(r, c).replace('.', ',') : cell(r, c))));
    if (t.totals) lines.push(t.columns.map((c, i) => (i === 0 ? 'Total' : t.totals[c.key] != null ? Number(t.totals[c.key]).toFixed(2).replace('.', ',') : '')));
    lines.push([]);
  }
  return '﻿' + lines.map((l) => l.map(esc).join(';')).join('\r\n');
}

export async function toXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Barber Pro';
  wb.created = new Date(report.generatedAt);
  const resumo = wb.addWorksheet('Resumo');
  resumo.addRow([report.company]).font = { bold: true, size: 14 };
  resumo.addRow([report.title]).font = { bold: true };
  resumo.addRow([report.subtitle]);
  for (const f of report.filters) resumo.addRow(f);
  resumo.addRow([`Gerado em ${formatLocal(new Date(report.generatedAt), 'America/Sao_Paulo')} por ${report.generatedBy}`]);
  resumo.addRow([]);
  for (const k of report.kpis) resumo.addRow(k);
  resumo.getColumn(1).width = 40;
  resumo.getColumn(2).width = 28;

  report.tables.forEach((t, idx) => {
    const name = `${idx + 1} ${t.title}`.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(name);
    ws.addRow([t.title]).font = { bold: true };
    const head = ws.addRow(t.columns.map((c) => c.label));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1C1F' } }));
    for (const r of t.rows) {
      ws.addRow(t.columns.map((c) => (c.money && r[c.key] !== '' && r[c.key] != null ? Number(r[c.key]) : cell(r, c))));
    }
    if (t.totals) {
      const tr = ws.addRow(t.columns.map((c, i) => (i === 0 ? 'Total' : t.totals[c.key] != null ? Number(t.totals[c.key]) : '')));
      tr.font = { bold: true };
    }
    t.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(Math.max(c.label.length + 4, 12), 45);
      if (c.money) col.numFmt = '"R$" #,##0.00';
    });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** PDF A4 com cabeçalho, logotipo (se for PNG/JPG enviado), filtros, indicadores, tabelas e totais. */
export function toPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: report.title, Author: report.company } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const W = doc.page.width - 80;
    const gold = '#9A7A2E';

    let logoDrawn = false;
    if (report.logoUrl?.startsWith('/uploads/')) {
      const file = path.join(env.UPLOAD_DIR, path.basename(report.logoUrl));
      if (/\.(png|jpe?g)$/i.test(file) && fs.existsSync(file)) {
        try {
          doc.image(file, 40, 36, { fit: [60, 40] });
          logoDrawn = true;
        } catch {
          /* imagem inválida: segue sem logotipo */
        }
      }
    }
    const x0 = logoDrawn ? 110 : 40;
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(15).text(report.company, x0, 38);
    doc.font('Helvetica').fontSize(11).fillColor('#333').text(report.title, x0, 58);
    doc.fontSize(9).fillColor('#666').text(report.subtitle, x0, 74);
    doc.moveTo(40, 92).lineTo(40 + W, 92).strokeColor(gold).lineWidth(1.2).stroke();
    doc.y = 100;

    doc.fontSize(8.5).fillColor('#444');
    for (const [k, v] of report.filters) doc.text(`${k}: ${v}`, 40, doc.y, { width: W });
    doc.moveDown(0.6);

    // Indicadores em duas colunas
    const colW = W / 2;
    let y = doc.y;
    report.kpis.forEach(([k, v], i) => {
      const x = 40 + (i % 2) * colW;
      if (i % 2 === 0 && i > 0) y += 16;
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      doc.font('Helvetica').fontSize(8.5).fillColor('#555').text(k, x, y, { width: colW * 0.58 });
      doc.font('Helvetica-Bold').fillColor('#111').text(v, x + colW * 0.58, y, { width: colW * 0.4, align: 'right' });
    });
    doc.y = y + 26;

    for (const t of report.tables) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111').text(t.title, 40, doc.y);
      doc.moveDown(0.3);
      const widths = t.columns.map((c) => (c.money ? 1 : c.key === 'description' || c.key === 'name' ? 2.2 : 1.2));
      const totalW = widths.reduce((a, b) => a + b, 0);
      const cw = widths.map((w) => (w / totalW) * W);
      const drawRow = (vals, opts = {}) => {
        const h = Math.max(...vals.map((v, i) => doc.heightOfString(String(v), { width: cw[i] - 6, fontSize: 8 }))) + 6;
        if (doc.y + h > doc.page.height - 50) {
          doc.addPage();
          if (!opts.header) drawRow(t.columns.map((c) => c.label), { header: true });
        }
        const top = doc.y;
        if (opts.header) doc.rect(40, top, W, h).fill('#1C1C1F');
        else if (opts.total) doc.rect(40, top, W, h).fill('#F3EEDF');
        let x = 40;
        vals.forEach((v, i) => {
          doc.font(opts.header || opts.total ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
            .fillColor(opts.header ? '#FFFFFF' : '#222')
            .text(String(v), x + 3, top + 3, { width: cw[i] - 6, align: t.columns[i].money ? 'right' : 'left' });
          x += cw[i];
        });
        doc.y = top + h;
        if (!opts.header) doc.moveTo(40, doc.y).lineTo(40 + W, doc.y).strokeColor('#E5E5E5').lineWidth(0.5).stroke();
      };
      drawRow(t.columns.map((c) => c.label), { header: true });
      if (!t.rows.length) drawRow(t.columns.map((_, i) => (i === 0 ? 'Nenhum registro no período' : '')));
      for (const r of t.rows) drawRow(t.columns.map((c) => (c.money && r[c.key] !== '' && r[c.key] != null ? brl(r[c.key]) : cell(r, c))));
      if (t.totals) drawRow(t.columns.map((c, i) => (i === 0 ? 'Total' : t.totals[c.key] != null ? brl(t.totals[c.key]) : '')), { total: true });
      doc.moveDown(1);
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(7.5).fillColor('#888').text(
        `Gerado em ${formatLocal(new Date(report.generatedAt), 'America/Sao_Paulo')} por ${report.generatedBy} · Página ${i + 1} de ${range.count}`,
        40, doc.page.height - 32, { width: W, align: 'center', lineBreak: false },
      );
    }
    doc.end();
  });
}

/** Envia o relatório no formato pedido. */
export async function send(res, report, format, baseName) {
  const file = `${baseName}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
    return res.send(toCsv(report));
  }
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.xlsx"`);
    return res.send(await toXlsx(report));
  }
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file}.pdf"`);
    return res.send(await toPdf(report));
  }
  return res.json(report);
}
