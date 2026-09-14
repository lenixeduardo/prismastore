function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function classifyInboundJid(jid = '') {
  const value = String(jid);
  if (!value) return { supported: false, reason: 'missing-jid' };
  if (value === 'status@broadcast' || value.endsWith('@broadcast')) return { supported: false, reason: 'broadcast' };
  if (value.endsWith('@g.us')) return { supported: false, reason: 'group' };
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@lid')) return { supported: true, reason: null };
  return { supported: false, reason: 'unsupported-jid' };
}

export function normalizeOutboundJid(value = '') {
  const raw = String(value).trim();
  if (!raw) throw new Error('Destinatário do WhatsApp inválido.');
  if (raw.includes('@')) return raw;
  const phone = digits(raw);
  if (!phone) throw new Error('Destinatário do WhatsApp inválido.');
  return `${phone}@s.whatsapp.net`;
}

export function phoneFromJid(jid = '') {
  return digits(String(jid).split('@')[0]);
}
