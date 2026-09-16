function tlv(id, value) {
  const text = String(value ?? '');
  if (text.length > 99) throw new Error(`Campo Pix ${id} excede 99 caracteres.`);
  return `${id}${String(text.length).padStart(2, '0')}${text}`;
}

function sanitize(value, maxLength) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .toUpperCase()
    .trim()
    .slice(0, maxLength);
}

function crc16Ccitt(payload) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixPayload({ key, recipientName, recipientCity, amount, txid = '***' } = {}) {
  const pixKey = String(key ?? '').trim();
  const name = sanitize(recipientName, 25);
  const city = sanitize(recipientCity, 15);
  const transactionId = txid === '***' ? '***' : sanitize(txid, 25).replace(/[^A-Z0-9]/g, '');
  const numericAmount = Number(amount);

  if (!pixKey) throw new Error('PIX_KEY não configurada.');
  if (!name) throw new Error('PIX_RECIPIENT_NAME não configurado.');
  if (!city) throw new Error('PIX_RECIPIENT_CITY não configurada.');
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Valor Pix inválido.');

  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', pixKey);
  const additionalData = tlv('05', transactionId || '***');
  const withoutCrc = [
    tlv('00', '01'),
    tlv('26', merchantAccount),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', numericAmount.toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', name),
    tlv('60', city),
    tlv('62', additionalData),
    '6304',
  ].join('');

  return `${withoutCrc}${crc16Ccitt(withoutCrc)}`;
}
