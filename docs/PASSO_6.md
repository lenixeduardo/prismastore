# Passo 6 — Operação e tracker

## Fluxo

```text
PAYMENT_PENDING
  ↓ webhook Asaas
PAID
  ↓ Embalar
PACKING
  ├─ Entrega local → OUT_FOR_DELIVERY
  └─ Envio         → SHIPPED
  ↓
DELIVERED
```

## Endpoint operacional

`POST /api/orders/:id/advance`

Body:

```json
{ "expectedStatus": "PAID" }
```

O `expectedStatus` funciona como trava otimista simples: se o pedido já mudou, a chamada retorna o estado atual sem avançar novamente.

## WhatsApp

Cada transição envia o tracker atualizado. Ao chegar em `DELIVERED`, o sistema envia primeiro a arte versionada em `assets/prismastore-order-finished.b64`, reconstruída como PNG local ao iniciar, e depois a mensagem final. Falha na notificação não reverte a mudança operacional já persistida.
