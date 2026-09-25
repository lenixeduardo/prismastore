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

function extractRideLink(text = '') {
  const match = String(text).match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0] || null;
}

function recordRideLink(stateStore, orderId, rideLink) {
  if (!orderId || !rideLink) return false;
  let recorded = false;
  stateStore.updateState((state) => {
    const order = state.orders.find((candidate) => candidate.id === orderId);
    const isPilot = order?.items?.some((item) => item?.productId === 'catalog-eduardo-teste');
    if (!order || !isPilot || order.deliveryType !== 'local_delivery') return state;
    order.deliveryJourney = {
      ...(order.deliveryJourney || {}),
      rideLink,
      rideRegisteredAt: new Date().toISOString(),
      rideSource: 'whatsapp-customer',
    };
    recorded = true;
    return state;
  });
  return recorded;
}

export function createPaymentChatbot({ baseChatbot, stateStore, paymentService }) {
  function isLocalPix() {
    return paymentService?.getStatus?.().provider === 'pix-local';
  }

  async function sendPix({ phone, session, cpfCnpj, sendText, sendMedia }) {
    const pix = await paymentService.generatePixForOrder({ orderId: session.orderId, cpfCnpj });
    const nextSession = { ...session, step: 'awaiting_payment', paymentId: pix.paymentId };
    saveSession(stateStore, phone, nextSession);

    if (pix.encodedImage) {
      try {
        await sendMedia({ mimeType: 'image/png', base64: pix.encodedImage, filename: 'pix-prismastore.png' });
      } catch {
        // O Copia e Cola mantém o fluxo utilizável caso a mídia falhe.
      }
    }

    if (isLocalPix()) {
      await sendText(`💠 *Pix do seu pedido*\n\n*Pix Copia e Cola:*\n${pix.payload}\n\nDepois de pagar, envie aqui a *imagem do comprovante*. O PrismaStore confere valor, destinatário, data e horário antes de liberar o pedido para embalagem.`);
    } else {
      await sendText(`💠 *Pix gerado para o seu pedido*\n\n*Pix Copia e Cola:*\n${pix.payload}\n\n${pix.expirationDate ? `Validade do QR: ${pix.expirationDate}\n\n` : ''}Assim que o Asaas confirmar o pagamento, o pedido muda automaticamente para *Pago · Embalar*.`);
    }
    return { session: nextSession, pix };
  }

  async function handlePaymentState({ phone, session, text, receiptText, receiptFingerprint, sendText, sendMedia }) {
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
      if (isLocalPix()) {
        if (!receiptText) {
          await sendText('Seu pedido está aguardando o Pix. Depois do pagamento, envie a *imagem do comprovante* nesta conversa.');
          return { handled: true, step: session.step };
        }
        const result = paymentService.validateReceiptForOrder({
          orderId: session.orderId,
          text: receiptText,
          fingerprint: receiptFingerprint,
        });
        if (result.handled) {
          const paidSession = { ...session, step: 'paid', paidAt: new Date().toISOString() };
          saveSession(stateStore, phone, paidSession);
          await sendText('✅ Pagamento validado. Valor, destinatário, data e horário conferem. Seu pedido está liberado para separação e embalagem.');
          return { handled: true, step: 'paid', orderId: session.orderId, duplicate: result.duplicate };
        }
        await sendText('⚠️ Não foi possível validar automaticamente o comprovante. O pedido permanece aguardando pagamento e foi marcado para *validação manual*.');
        return { handled: true, step: session.step, orderId: session.orderId, manualReview: true, reasons: result.reasons };
      }
      await sendText('Seu pedido está aguardando a confirmação automática do Pix. Você não precisa enviar comprovante.');
      return { handled: true, step: session.step };
    }

    if (session.step === 'paid') {
      const rideLink = extractRideLink(text);
      if (rideLink && recordRideLink(stateStore, session.orderId, rideLink)) {
        await sendText('✅ Link da corrida registrado. Vou manter esse vínculo no dossiê da entrega junto com os horários do pedido e do recebimento.');
        return { handled: true, step: session.step, orderId: session.orderId, rideLinkRecorded: true };
      }
      await sendText('✅ O pagamento já foi confirmado. Seu pedido está na fila de separação e embalagem.');
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
        receiptText: args.receiptText,
        receiptFingerprint: args.receiptFingerprint,
        sendText: args.sendText,
        sendMedia: args.sendMedia ?? (async () => {}),
      });
      if (paymentResult) return paymentResult;
    }

    const result = await baseChatbot.handleIncoming(args);
    if (!paymentService || !phone || !result?.orderId || result.step !== 'confirmed') return result;

    const confirmedSession = stateStore.getChatSession(phone);
    if (!confirmedSession) return result;

    if (isLocalPix()) {
      await args.sendText('Vou gerar o Pix do seu pedido agora.');
      try {
        const { session: nextSession, pix } = await sendPix({
          phone,
          session: confirmedSession,
          sendText: args.sendText,
          sendMedia: args.sendMedia ?? (async () => {}),
        });
        return { ...result, step: nextSession.step, paymentId: pix.paymentId };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível gerar o Pix.';
        await args.sendText(`Não consegui gerar o Pix agora: ${message}`);
        return { ...result, error: 'payment-error' };
      }
    }

    if (paymentService.needsPayerDocument(result.orderId)) {
      const nextSession = { ...confirmedSession, step: 'payment_document' };
      saveSession(stateStore, phone, nextSession);
      await args.sendText('Para gerar o Pix, envie o *CPF ou CNPJ do pagador*. O documento é usado no Asaas e não fica salvo no PrismaStore.');
      return { ...result, step: nextSession.step };
    }

    await args.sendText('Vou gerar o Pix do seu pedido agora.');
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
