# Passo 4 — Pedido e estoque

Este checkpoint conecta a confirmação do chatbot ao pedido operacional real:

1. valida estoque novamente;
2. reserva o carrinho atomicamente;
3. cria pedido `PAYMENT_PENDING`;
4. grava `sourceCheckoutId` para idempotência;
5. sincroniza o painel automaticamente;
6. identifica pedidos em `Aguardando Pix`.

Validação local: 46 testes passando.
