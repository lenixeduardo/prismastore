import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHATBOT_MESSAGES, resolveChatbotMessage } from '../server/chatbot-messages.js';

test('replaces supported placeholders in custom messages', () => {
  const state = { settings: { chatbotMessages: { quantityPrompt: 'Leve {produto}; temos {estoque}.' } } };
  assert.equal(resolveChatbotMessage(state, 'quantityPrompt', { produto: 'Seda', estoque: 2 }), 'Leve Seda; temos 2.');
});

test('falls back to the default when configured value is blank', () => {
  const state = { settings: { chatbotMessages: { welcome: '   ' } } };
  const value = resolveChatbotMessage(state, 'welcome', { cliente: 'Ana' });
  assert.match(value, /Ana/);
  assert.match(value, /Prisma Store/);
});

test('unknown placeholders remain literal instead of throwing', () => {
  const state = { settings: { chatbotMessages: { welcome: 'Oi {desconhecido}' } } };
  assert.equal(resolveChatbotMessage(state, 'welcome'), 'Oi {desconhecido}');
});

test('default message registry keeps every required flow key', () => {
  for (const key of ['welcome','catalogHeader','catalogInstruction','invalidProduct','quantityPrompt','invalidQuantity','cartActions','deliveryPrompt','savedAddressPrompt','addressInputPrompt','confirmationPrompt','cancelled','paymentPending','paymentConfirmed','orderFinished']) {
    assert.equal(typeof DEFAULT_CHATBOT_MESSAGES[key], 'string');
    assert.ok(DEFAULT_CHATBOT_MESSAGES[key].length > 0);
  }
});
