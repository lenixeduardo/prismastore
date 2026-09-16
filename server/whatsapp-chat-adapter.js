import { classifyInboundJid } from './whatsapp-jid.js';
import { fingerprintReceipt } from './pix-receipt.js';

function extractText(message) {
  return message?.message?.conversation ?? message?.message?.extendedTextMessage?.text ?? '';
}

function extractImageMessage(message) {
  return message?.message?.imageMessage
    ?? message?.message?.ephemeralMessage?.message?.imageMessage
    ?? message?.message?.viewOnceMessage?.message?.imageMessage
    ?? message?.message?.viewOnceMessageV2?.message?.imageMessage
    ?? null;
}

export function createWhatsAppChatAdapter({ chatbot, receiptOcr = null, downloadMedia = null }) {
  async function handleMessage({ message, socket }) {
    if (!message) return { handled: false, reason: 'missing-message' };
    if (message?.key?.fromMe) return { handled: false, reason: 'from-me' };

    const jid = message?.key?.remoteJid ?? '';
    const classification = classifyInboundJid(jid);
    if (!classification.supported) return { handled: false, reason: classification.reason };

    const text = String(extractText(message)).trim();
    const imageMessage = extractImageMessage(message);
    if (!text && !imageMessage) return { handled: false, reason: 'unsupported-content' };
    if (!text && imageMessage && (!receiptOcr || !downloadMedia)) {
      return { handled: false, reason: 'unsupported-content' };
    }

    const sendText = (value) => socket.sendMessage(jid, { text: String(value) });
    const sendMedia = (source) => {
      if (typeof source === 'string') {
        return socket.sendMessage(jid, { image: { url: source } });
      }
      if (source?.base64) {
        return socket.sendMessage(jid, {
          image: Buffer.from(source.base64, 'base64'),
          mimetype: source.mimeType || 'image/png',
          fileName: source.filename || 'imagem.png',
        });
      }
      throw new Error('Mídia do WhatsApp inválida.');
    };

    let receiptText = null;
    let receiptFingerprint = null;
    if (imageMessage && receiptOcr && downloadMedia) {
      try {
        const buffer = await downloadMedia({ message, socket });
        receiptFingerprint = fingerprintReceipt(buffer);
        receiptText = await receiptOcr.extractText(buffer);
        // O buffer da imagem é transitório: somente fingerprint e campos extraídos seguem no fluxo.
      } catch (error) {
        await sendText('Não consegui ler a imagem do comprovante. Envie uma captura nítida, mostrando valor, destinatário, data e horário.');
        return { handled: true, reason: 'receipt-ocr-failed', error: error instanceof Error ? error.message : 'OCR falhou' };
      }
    }

    return chatbot.handleIncoming({
      chatId: jid,
      text,
      receiptText,
      receiptFingerprint,
      contactName: message.pushName ?? null,
      sendText,
      sendMedia,
    });
  }

  return { handleMessage };
}
