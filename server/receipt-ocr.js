export function createReceiptOcr({ recognize = null } = {}) {
  let defaultRecognize = recognize;

  async function resolveRecognizer() {
    if (defaultRecognize) return defaultRecognize;
    const { createWorker } = await import('tesseract.js');
    defaultRecognize = async (input) => {
      const worker = await createWorker('por');
      try {
        return await worker.recognize(input);
      } finally {
        await worker.terminate();
      }
    };
    return defaultRecognize;
  }

  async function extractText(input) {
    if (!input || (Buffer.isBuffer(input) && input.length === 0)) throw new Error('Comprovante vazio.');
    const runner = await resolveRecognizer();
    const result = await runner(input);
    const text = typeof result === 'string' ? result : result?.data?.text;
    if (!String(text ?? '').trim()) throw new Error('Não foi possível ler o comprovante.');
    return String(text).trim();
  }

  return { extractText };
}
