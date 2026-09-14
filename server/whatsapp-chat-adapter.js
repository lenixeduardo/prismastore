function contactDisplayName(contact) {
  return contact?.pushname || contact?.name || contact?.shortName || null;
}

export function createWhatsAppChatAdapter({ chatbot, mediaFactory }) {
  return async function handleWhatsAppMessage({ message, activeClient }) {
    if (!message || message.fromMe) return { handled: false, reason: 'from-self' };

    let contactName = null;
    if (typeof message.getContact === 'function') {
      try {
        contactName = contactDisplayName(await message.getContact());
      } catch {
        contactName = null;
      }
    }

    return chatbot.handleIncoming({
      chatId: message.from,
      text: message.body ?? '',
      contactName,
      sendText: (text) => activeClient.sendMessage(message.from, text),
      sendMedia: async (source) => {
        const media = typeof source === 'string'
          ? mediaFactory.fromFilePath(source)
          : mediaFactory.fromBase64(source);
        return activeClient.sendMessage(message.from, media);
      },
    });
  };
}
