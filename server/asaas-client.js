const DEFAULT_BASE_URL = 'https://api-sandbox.asaas.com/v3';

function apiErrorMessage(body, status) {
  const descriptions = Array.isArray(body?.errors)
    ? body.errors.map((error) => error?.description || error?.code).filter(Boolean)
    : [];
  return descriptions.join('; ') || body?.message || `Asaas respondeu HTTP ${status}`;
}

export function createAsaasClient({
  apiKey = '',
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  userAgent = 'PrismaStore/0.5.0 (Node.js; payments)',
} = {}) {
  const normalizedBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const environment = normalizedBaseUrl.includes('sandbox') ? 'sandbox' : 'production';
  const configured = Boolean(String(apiKey).trim());

  async function request(path, { method = 'GET', body } = {}) {
    if (!configured) throw new Error('ASAAS_API_KEY não configurada.');
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': userAgent,
      access_token: apiKey,
    };
    const options = { method, headers };
    if (body !== undefined) options.body = JSON.stringify(body);
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, options);
    let payload = null;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) throw new Error(apiErrorMessage(payload, response.status));
    return payload;
  }

  return {
    environment,
    configured,
    baseUrl: normalizedBaseUrl,
    createCustomer(input) {
      return request('/customers', {
        method: 'POST',
        body: {
          name: input.name,
          cpfCnpj: input.cpfCnpj,
          mobilePhone: input.mobilePhone,
          externalReference: input.externalReference,
          notificationDisabled: true,
        },
      });
    },
    createPixPayment(input) {
      return request('/payments', {
        method: 'POST',
        body: {
          customer: input.customerId,
          billingType: 'PIX',
          value: Number(input.value),
          dueDate: input.dueDate,
          description: input.description,
          externalReference: input.externalReference,
        },
      });
    },
    getPixQrCode(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
    },
    getPayment(paymentId) {
      return request(`/payments/${encodeURIComponent(paymentId)}`);
    },
  };
}
