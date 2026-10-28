// Datas e horários no fuso de cada unidade. No banco tudo é UTC (timestamptz).
import { DateTime } from 'luxon';
import { badRequest } from './errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(dateStr) {
  if (!DATE_RE.test(dateStr) || !DateTime.fromISO(dateStr).isValid) throw badRequest('Data inválida (use AAAA-MM-DD).');
}

/** Data local + minutos desde 00:00 → instante UTC (Date). */
export function localToUtc(dateStr, minutes, tz) {
  const dt = DateTime.fromISO(dateStr, { zone: tz }).startOf('day').plus({ minutes });
  return dt.toUTC().toJSDate();
}

/** Início e fim (exclusivo) de um dia local, em UTC. */
export function dayRange(dateStr, tz) {
  const start = DateTime.fromISO(dateStr, { zone: tz }).startOf('day');
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}

/** Intervalo [from, to] de datas locais (inclusive) → instantes UTC [start, end). */
export function periodRange(from, to, tz = 'America/Sao_Paulo') {
  assertDate(from);
  assertDate(to);
  const start = DateTime.fromISO(from, { zone: tz }).startOf('day');
  const end = DateTime.fromISO(to, { zone: tz }).startOf('day').plus({ days: 1 });
  if (end <= start) throw badRequest('O período final deve ser igual ou posterior ao inicial.');
  if (end.diff(start, 'days').days > 3700) throw badRequest('Período muito longo.');
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}

/** 0 = domingo … 6 = sábado (mesma convenção do JavaScript). */
export function weekdayOf(dateStr, tz) {
  return DateTime.fromISO(dateStr, { zone: tz }).weekday % 7;
}

/** Minutos desde 00:00 locais de um instante. */
export function minutesOfDay(date, tz) {
  const dt = DateTime.fromJSDate(date, { zone: tz });
  return dt.hour * 60 + dt.minute;
}

export function localDateOf(date, tz) {
  return DateTime.fromJSDate(date, { zone: tz }).toISODate();
}

export function formatLocal(date, tz, fmt = 'dd/MM/yyyy HH:mm') {
  return DateTime.fromJSDate(date, { zone: tz }).toFormat(fmt);
}

export function todayLocal(tz) {
  return DateTime.now().setZone(tz).toISODate();
}

export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function isValidTimeZone(tz) {
  return DateTime.now().setZone(tz).isValid;
}
