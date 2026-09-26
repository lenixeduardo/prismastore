import { classifyInboundJid, phoneFromJid } from './whatsapp-jid.js';
import { fingerprintReceipt } from './pix-receipt.js';

function unwrapMessageContent(message) {
  let content = message?.message;
  for (let depth = 0; depth < 4 && content; depth += 1) {
    const nested = content.ephemeralMessage?.message
      ?? content.viewOnceMessage?.message
      ?? content.viewOnceMessageV2?.message
      ?? content.viewOnceMessageV2Extension?.message
      ?? content.documentWithCaptionMessage?.message;
    if (!nested) break;
    content = nested;
  }
  return content ?? null;
}

function extractText(message) {
  const content = unwrapMessageContent(message);
  return content?.conversation
    ?? content?.extendedTextMessage?.text
    ?? content?.imageMessage?.caption
    ?? '';
}

function extractImageMessage(message) {
  return unwrapMessageContent(message)?.imageMessage ?? null;
}

function contactPhones(message) {
  return [...new Set([
    message?.key?.remoteJid,
    message?.key?.remoteJidAlt,
  ].filter(Boolean).map(phoneFromJid).filter(Boolean))];
}

export function createWhatsAppChatAdapter({
  chatbot,
  receiptOcr = null,
  downloadMedia = null,
  isSavedContact = null,
}) {
  async function handleMessage({ message, socket }) {
    if (!message) return { handled: false, reason: 'missing-message' };
    if (message?.key?.fromMe) return { handled: false, reason: 'from-me' };

    const jid = message?.key?.remoteJid ?? '';
    const classification = classifyInboundJid(jid);
    if (!classification.supported) return { handled: false, reason: classification.reason };

    const phones = contactPhones(message);
    if (isSavedContact && !(await isSavedContact({ message, jid, phones }))) {
      return { handled: false, reason: 'unsaved-contact' };
    }

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
