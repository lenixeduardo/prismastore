import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInboundJid, normalizeOutboundJid, phoneFromJid } from '../server/whatsapp-jid.js';

test('normalizes a plain phone to a Baileys individual jid', () => {
  assert.equal(normalizeOutboundJid('+55 (11) 99999-0000'), '5511999990000@s.whatsapp.net');
});

test('preserves complete Baileys jids', () => {
  assert.equal(normalizeOutboundJid('5511999990000@s.whatsapp.net'), '5511999990000@s.whatsapp.net');
  assert.equal(normalizeOutboundJid('123456789@lid'), '123456789@lid');
});

test('classifies only supported individual chats as inbound', () => {
  assert.deepEqual(classifyInboundJid('5511999990000@s.whatsapp.net'), { supported: true, reason: null });
  assert.deepEqual(classifyInboundJid('123456789@lid'), { supported: true, reason: null });
  assert.equal(classifyInboundJid('1203630@g.us').supported, false);
  assert.equal(classifyInboundJid('status@broadcast').supported, false);
  assert.equal(classifyInboundJid('').supported, false);
});

test('extracts numeric identity from supported jids', () => {
  assert.equal(phoneFromJid('5511999990000@s.whatsapp.net'), '5511999990000');
  assert.equal(phoneFromJid('123456789@lid'), '123456789');
});
