function digits(value = '') {
  return String(value).replace(/\D/g, '');
}

function saveSession(stateStore, phone, session) {
  stateStore.saveChatSession(phone, session);
  return session;
}

function isRecoveryCommand(text = '') {
  const normalized = String(text).trim().toLowerCase();
  return ['menu', 'início', 'inicio', 'reiniciar', 'cancelar'].includes(normalized);
}

export function createPaymentChatbot({ baseChatbot, stateStore, paymentService }) {
  async function sendPix({ phone, session, cpfCnpj, sendText, sendMedia }) {
    const pix = await paymentService.generatePixForOrder({ orderId: session.orderId, cpfCnpj });
    const nextSession = { ...session, step: 'awaiting_payment', paymentId: pix.paymentId };
    saveSession(stateStore, phone, nextSession);

    if (pix.encodedImage) {
      try {
        await sendMedia({ mimeType: 'image/png', base64: pix.encodedImage, filename: `pix-${session.orderId}.png` });
      } catch {
        // O Copia e Cola mantém o fluxo utilizável caso a mídia falhe.
      }
    }

    await sendText(`💠 *Pix gerado para o pedido ${session.orderId}*\n\n*Pix Copia e Cola:*\n${pix.payload}\n\n${pix.expirationDate ? `Validade do QR: ${pix.expirationDate}\n\n` : ''}Assim que o Asaas confirmar o pagamento, o pedido muda automaticamente para *Pago · Embalar*.`);
    return { session: nextSession, pix };
  }

  async function handlePaymentState({ phone, session, text, sendText, sendMedia }) {
    if (session.step === 'payment_document') {
      const cpfCnpj = digits(text);
      if (![11, 14].includes(cpfCnpj.length)) {
        await sendText('Envie um CPF/CNPJ com *11 ou 14 dígitos*. Pode enviar com ou sem pontuação.');
        return { handled: true, step: session.step };
      }
      try {
        const { session: nextSession, pix } = await sendPix({ phone, session, cpfCnpj, sendText, sendMedia });
        return { handled: true, step: nextSession.step, orderId: session.orderId, paymentId: pix.paymentId };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível gerar o Pix.';
        await sendText(`Não consegui gerar o Pix agora: ${message}\n\nConfira o CPF/CNPJ e tente novamente.`);
        return { handled: true, step: session.step, error: 'payment-error' };
      }
    }

    if (session.step === 'awaiting_payment') {
      await sendText(`O pedido *${session.orderId}* está aguardando a confirmação automática do Pix. Você não precisa enviar comprovante.`);
      return { handled: true, step: session.step };
    }

    if (session.step === 'paid') {
      await sendText(`✅ O pagamento do pedido *${session.orderId}* já foi confirmado. Seu pedido está na fila de separação e embalagem.`);
      return { handled: true, step: session.step };
    }

    return null;
  }

  async function handleIncoming(args) {
    const phone = digits(String(args.chatId ?? '').split('@')[0]);
    const session = phone ? stateStore.getChatSession(phone) : null;

    if (session && !isRecoveryCommand(args.text)) {
      const paymentResult = await handlePaymentState({
        phone,
        session,
        text: args.text,
        sendText: args.sendText,
        sendMedia: args.sendMedia ?? (async () => {}),
      });
      if (paymentResult) return paymentResult;
    }

    const result = await baseChatbot.handleIncoming(args);
    if (!paymentService || !phone || !result?.orderId || result.step !== 'confirmed') return result;

    const confirmedSession = stateStore.getChatSession(phone);
    if (!confirmedSession) return result;

    if (paymentService.needsPayerDocument(result.orderId)) {
      const nextSession = { ...confirmedSession, step: 'payment_document' };
      saveSession(stateStore, phone, nextSession);
      await args.sendText(`Para gerar o Pix do pedido *${result.orderId}*, envie o *CPF ou CNPJ do pagador*. O documento é usado no Asaas e não fica salvo no PrismaStore.`);
      return { ...result, step: nextSession.step };
    }

    await args.sendText(`Vou gerar o Pix do pedido *${result.orderId}* agora.`);
    try {
      const { session: nextSession, pix } = await sendPix({
        phone,
        session: confirmedSession,
        sendText: args.sendText,
        sendMedia: args.sendMedia ?? (async () => {}),
      });
      return { ...result, step: nextSession.step, paymentId: pix.paymentId };
    } catch (error) {
      const nextSession = { ...confirmedSession, step: 'payment_document' };
      saveSession(stateStore, phone, nextSession);
      const message = error instanceof Error ? error.message : 'Não foi possível gerar o Pix.';
      await args.sendText(`Não consegui gerar o Pix automaticamente: ${message}\nEnvie o CPF/CNPJ do pagador para tentar novamente.`);
      return { ...result, step: nextSession.step, error: 'payment-error' };
    }
  }

  return { handleIncoming };
}
