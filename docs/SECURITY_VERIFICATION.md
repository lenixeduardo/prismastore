# Validação da correção de segurança

A suíte completa executada após a correção: 315 testes, 303 aprovados e 12 falhas preexistentes. A versão base a06cd8db987d02401d29cae077d4736878191262 tinha 13 falhas; a assertion antiga do cache foi atualizada para a revisão de segurança. Nenhuma falha nova permanece.

Falhas preexistentes fora do escopo desta correção:

- QR code is compact by default on desktop and mobile
- manifest installs the approved prism artwork as scalable PWA icons
- chatbot guides item, quantity, delivery, address and confirmation without commands
- dashboard uses a vector critical-stock asset and server declares WebP MIME
- starts on the PrismaStore hero page before revealing the control panel
- index starts on a full-screen hero and exposes one functional dashboard entry button
- item 4 applies the requested quantity totals
- chatbot persists the discounted unit price and total for 5 units of item 4
- WhatsApp pairing uses a canonical Baileys browser identity
- admin supports same-phone pairing from the home and reflects Pix Oscar
- Passo 4 cria pedido PAYMENT_PENDING e baixa o estoque ao confirmar
- módulo live-sync só inicia após runtime autenticado e atualiza quando o estado muda

Testes novos reproduziram antes da correção: acesso a configuração privada, autenticação ausente concedendo acesso, symlinks, exposição de dados de entrega, links sem expiração e sem revogação. Depois passaram. APIs operacionais são verificadas com login HTTP real.

Produção não foi modificada por SSH nesta sessão. O instalador do Nginx precisa ser executado na VM e a aplicação reiniciada.
