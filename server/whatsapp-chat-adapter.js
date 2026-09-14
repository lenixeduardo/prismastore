import { classifyInboundJid } from './whatsapp-jid.js';

function extractText(message) {
  return message?.message?.conversation ?? message?.message?.extendedTextMessage?.text ?? '';
}

export function createWhatsAppChatAdapter({ chatbot }) {
  async function handleMessage({ message, socket }) {
    if (!message) return { handled: false, reason: 'missing-message' };
    if (message?.key?.fromMe) return { handled: false, reason: 'from-me' };

    const jid = message?.key?.remoteJid ?? '';
    const classification = classifyInboundJid(jid);
    if (!classification.supported) return { handled: false, reason: classification.reason };

    const text = String(extractText(message)).trim();
    if (!text) return { handled: false, reason: 'unsupported-content' };

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

    return chatbot.handleIncoming({
      chatId: jid,
      text,
      contactName: message.pushName ?? null,
      sendText,
      sendMedia,
    });
  }

  return { handleMessage };
}
