function contactDisplayName(contact) {
  return contact?.pushname || contact?.name || contact?.shortName || null;
}

function serializedMessageId(message) {
  const value = message?.id?._serialized;
  return typeof value === 'string' && value ? value : null;
}

function isPrivateRecipient(value) {
  const chatId = String(value ?? '');
  return chatId.endsWith('@c.us') || chatId.endsWith('@lid');
}

export function createWhatsAppChatAdapter({
  chatbot,
  mediaFactory,
  now = () => Date.now(),
  replayToleranceMs = 5_000,
  maxSeenMessageIds = 2_000,
}) {
  const startedAtMs = Number(now());
  const seenMessageIds = new Set();
  const seenMessageQueue = [];

  function isStaleMessage(message) {
    const timestampSeconds = Number(message?.timestamp);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return false;
    return (timestampSeconds * 1000) < (startedAtMs - replayToleranceMs);
  }

  function isDuplicateMessage(message) {
    const id = serializedMessageId(message);
    if (!id) return false;
    if (seenMessageIds.has(id)) return true;

    seenMessageIds.add(id);
    seenMessageQueue.push(id);
    while (seenMessageQueue.length > maxSeenMessageIds) {
      const oldest = seenMessageQueue.shift();
      if (oldest) seenMessageIds.delete(oldest);
    }
    return false;
  }

  return async function handleWhatsAppMessage({ message, activeClient }) {
    if (!message || message.fromMe || message.id?.fromMe) return { handled: false, reason: 'from-self' };
    if (!isPrivateRecipient(message.from)) return { handled: false, reason: 'not-private' };
    if (isStaleMessage(message)) return { handled: false, reason: 'stale-message' };
    if (isDuplicateMessage(message)) return { handled: false, reason: 'duplicate-message' };

    const recipient = message.from;
    let contactName = null;
    if (typeof message.getContact === 'function') {
      try {
        contactName = contactDisplayName(await message.getContact());
      } catch {
        contactName = null;
      }
    }

    return chatbot.handleIncoming({
      chatId: recipient,
      text: message.body ?? '',
      contactName,
      sendText: (text) => activeClient.sendMessage(recipient, text),
      sendMedia: async (source) => {
        const media = typeof source === 'string'
          ? mediaFactory.fromFilePath(source)
          : mediaFactory.fromBase64(source);
        return activeClient.sendMessage(recipient, media);
      },
    });
  };
}
