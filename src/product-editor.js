function decimal(value) {
  if (typeof value === 'number') return value;
  return Number(String(value ?? '').trim().replace(',', '.'));
}

function defaultUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeProductInput(input = {}, existing = null, now = () => new Date(), uuid = defaultUuid) {
  const name = String(input.name ?? '').trim();
  const price = decimal(input.price);
  const stockRaw = String(input.stock ?? '').trim();
  const stock = stockRaw === '' ? 10 : Number(stockRaw);

  if (!name) throw new Error('Nome do produto é obrigatório.');
  if (!Number.isFinite(price) || price < 0) throw new Error('Preço deve ser um número maior ou igual a zero.');
  if (!Number.isInteger(stock) || stock < 0) throw new Error('Estoque deve ser um número inteiro maior ou igual a zero.');

  const timestamp = now().toISOString();
  return {
    id: existing?.id ?? `p-${uuid()}`,
    name,
    price,
    stock,
    active: input.active !== false,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}
