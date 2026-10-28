// Formatação para exibição. Valores chegam da API como string decimal ("50.00"); aqui só exibimos.
const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const brl = (v) => brlFmt.format(Number(v ?? 0));

export const TZ = 'America/Sao_Paulo';

export function dateBR(value, tz = TZ) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function timeBR(value, tz = TZ) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function dateTimeBR(value, tz = TZ) {
  if (!value) return '—';
  return `${dateBR(value, tz)} ${timeBR(value, tz)}`;
}

export function longDate(value, tz = TZ) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value));
}

/** AAAA-MM-DD de hoje (ou daqui a N dias) no fuso informado. */
export function isoDay(offsetDays = 0, tz = TZ) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthStart(iso = isoDay()) {
  return `${iso.slice(0, 8)}01`;
}

export const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const phoneBR = (p) => {
  const d = String(p ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p ?? '';
};

export const waLink = (p, text) => {
  const d = String(p ?? '').replace(/\D/g, '');
  if (!d) return null;
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const LABELS = {
  appointment: {
    SCHEDULED: 'Agendado', CONFIRMED: 'Confirmado', CHECKED_IN: 'Em atendimento', COMPLETED: 'Concluído', CANCELLED: 'Cancelado', NO_SHOW: 'Não compareceu',
  },
  sale: { OPEN: 'Aberta', CLOSED: 'Fechada', CANCELLED: 'Cancelada' },
  payment: { PAID: 'Pago', PARTIAL: 'Parcial', UNPAID: 'A receber' },
  method: { CASH: 'Dinheiro', PIX: 'Pix', DEBIT_CARD: 'Débito', CREDIT_CARD: 'Crédito', OTHER: 'Outro' },
  model: {
    COMMISSION: 'Comissão', FIXED: 'Remuneração fixa', FIXED_PLUS_COMMISSION: 'Fixo + comissão',
    CHAIR_RENTAL: 'Aluguel de cadeira', CHAIR_RENTAL_PLUS_COMMISSION: 'Aluguel + comissão',
  },
  rule: { SERVICE_COMMISSION_PCT: 'Comissão em serviços', PRODUCT_COMMISSION_PCT: 'Comissão em produtos', FIXED_SALARY: 'Remuneração fixa', CHAIR_RENTAL: 'Aluguel de cadeira' },
  obligation: { COMMISSION: 'Comissão', FIXED_SALARY: 'Remuneração fixa', CHAIR_RENTAL: 'Aluguel de cadeira', BONUS: 'Bônus', ADJUSTMENT: 'Ajuste' },
  obligationStatus: { OPEN: 'Em aberto', PARTIAL: 'Parcial', SETTLED: 'Quitado', CANCELLED: 'Cancelado' },
  account: { CASH: 'Caixa (dinheiro)', BANK: 'Banco', DIGITAL_WALLET: 'Carteira digital', CARD_RECEIVABLE: 'Recebíveis de cartão' },
  tx: {
    OPENING_BALANCE: 'Saldo inicial', SALE_PAYMENT: 'Recebimento de venda', INCOME: 'Receita', EXPENSE: 'Despesa', BILL_PAYMENT: 'Conta paga',
    BILL_RECEIPT: 'Conta recebida', BARBER_PAYOUT: 'Pagamento a profissional', CHAIR_RENT_RECEIPT: 'Aluguel de cadeira',
    TRANSFER_IN: 'Transferência recebida', TRANSFER_OUT: 'Transferência enviada', ADJUSTMENT: 'Ajuste', REVERSAL: 'Estorno',
  },
  bill: { OPEN: 'Em aberto', PARTIAL: 'Parcial', PAID: 'Quitada', CANCELLED: 'Cancelada' },
  review: { PENDING: 'Aguardando', APPROVED: 'Publicada', REJECTED: 'Recusada' },
  period: { WEEKLY: 'por semana', MONTHLY: 'por mês' },
};
