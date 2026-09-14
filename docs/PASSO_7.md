# Passo 7 — Relatórios reais

## Regra financeira

Um pedido entra no faturamento quando possui `paidAt` dentro do mês consultado. O status operacional atual não altera o histórico financeiro; portanto pedidos em `PACKING`, `SHIPPED`, `OUT_FOR_DELIVERY` e `DELIVERED` continuam contabilizados.

## Indicadores

- Faturamento mensal.
- Quantidade de pedidos pagos.
- Ticket médio.
- Faturamento por dia.
- Contas recebedoras e respectivos totais.
- Relação dos pedidos que compõem o período.

## Endpoints

```text
GET /api/reports/monthly?month=YYYY-MM
GET /api/reports/monthly.csv?month=YYYY-MM
```

O CSV usa separador `;`, BOM UTF-8 e os mesmos pedidos usados no painel.

## Conta recebedora

O agrupamento utiliza `receivingAccountId`, preenchido pela confirmação de pagamento. Atualmente o Asaas grava `asaas-main`; contas adicionais podem ser acrescentadas em `src/data.js` sem alterar a regra do relatório.
