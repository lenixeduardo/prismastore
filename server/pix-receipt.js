import { createHash } from 'node:crypto';

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function moneyToNumber(raw = '') {
  let value = String(raw).replace(/[^\d.,]/g, '');
  if (!value) return null;
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractAmount(text) {
  const source = String(text);
  const labelled = source.match(/(?:valor(?:\s+(?:pago|do\s+pix|da\s+transfer[eê]ncia))?)\s*[:\-]?\s*(?:R\$\s*)?([\d.]+,\d{2}|\d+[.,]\d{2})/i);
  const fallback = source.match(/R\$\s*([\d.]+,\d{2}|\d+[.,]\d{2})/i);
  return moneyToNumber(labelled?.[1] ?? fallback?.[1] ?? '');
}

function isValidCalendarDate(day, month, year) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function extractDateTime(text) {
  const source = String(text);
  const match = source.match(/(\d{2})\/(\d{2})\/(\d{4})[^\d]{0,20}(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, ss = '00'] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const hour = Number(hh);
  const minute = Number(min);
  const second = Number(ss);
  if (!isValidCalendarDate(day, month, year) || hour > 23 || minute > 59 || second > 59) return null;
  return {
    date: `${dd}/${mm}/${yyyy}`,
    time: `${hh}:${min}:${ss}`,
    key: `${yyyy}${mm}${dd}${hh}${min}${ss}`,
  };
}

function localDateTimeKey(isoString, timeZone = 'America/Sao_Paulo') {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

function extractTransactionId(text) {
  const source = String(text);
  const patterns = [
    /(?:ID\s+(?:da\s+)?transa[cç][aã]o|ID\s+Pix|E2E\s*ID)\s*[:\-]?\s*([A-Z0-9]{12,64})/i,
    /\b(E\d{20,64})\b/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

export function fingerprintReceipt(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function validatePixReceipt({
  text,
  order,
  recipientName,
  fingerprint,
  existingOrders = [],
  timeZone = 'America/Sao_Paulo',
} = {}) {
  const reasons = [];
  const amount = extractAmount(text);
  const dateTime = extractDateTime(text);
  const transactionId = extractTransactionId(text);
  const normalizedText = normalize(text);
  const normalizedRecipient = normalize(recipientName);

  const expectedCents = Math.round(Number(order?.total ?? NaN) * 100);
  const receivedCents = amount == null ? null : Math.round(amount * 100);
  if (receivedCents == null || !Number.isFinite(expectedCents) || receivedCents !== expectedCents) reasons.push('amount-mismatch');

  if (!normalizedRecipient || !normalizedText.includes(normalizedRecipient)) reasons.push('recipient-mismatch');

  const orderCreatedAt = order?.createdAt ?? order?.requestedAt ?? order?.created_at ?? null;
  const orderKey = orderCreatedAt ? localDateTimeKey(orderCreatedAt, timeZone) : null;
  if (!dateTime || !orderKey) reasons.push('invalid-payment-date');
  else if (dateTime.key <= orderKey) reasons.push('payment-not-after-order');

  const duplicate = existingOrders.some((candidate) => {
    if (!candidate || candidate.id === order?.id) return false;
    if (fingerprint && candidate.paymentReceiptFingerprint === fingerprint) return true;
    if (transactionId && candidate.paymentTransactionId === transactionId) return true;
    return false;
  });
  if (duplicate) reasons.push('duplicate-receipt');

  const uniqueReasons = [...new Set(reasons)];
  return {
    valid: uniqueReasons.length === 0,
    manualReview: uniqueReasons.length > 0,
    reasons: uniqueReasons,
    extracted: {
      amount,
      date: dateTime?.date ?? null,
      time: dateTime?.time ?? null,
      transactionId,
    },
    fingerprint: fingerprint || null,
  };
}
