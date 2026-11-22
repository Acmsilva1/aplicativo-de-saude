# PWA: avisos de senha, erros e faixa de segurança

Diagnóstico de 22/11/2026, horário de Brasília.

## Resultado confirmado

- Certificado HTTPS da VM válido para `controle-de-saude.duckdns.org` até 19/02/2027; cadeia validada com OpenSSL, retorno 0; HTTPS público 200. Renovação `certbot.timer` ativa. Nenhum certificado foi substituído desnecessariamente.
- Manifest publicado com `display: standalone`, `scope: /`, `start_url: /`. O fluxo de autenticação usa fetch no mesmo domínio e não abre uma janela externa.
- Na consulta pública do [Google Safe Browsing](https://transparencyreport.google.com/safe-browsing/search?url=controle-de-saude.duckdns.org), o endereço estava sinalizado como “Algumas páginas deste site não são seguras”, com indicação de possível conteúdo enganoso e última atualização em 21/11/2026. Esse resultado é uma classificação do Google, não prova de certificado expirado nem conclusão automática de comprometimento da VM.
- Os arquivos públicos comparados com build limpo do commit anterior corresponderam: JS/CSS/imagens por hash; HTML/manifest após normalizar somente formatação; service worker com seu identificador de cache de build normalizado. Nenhum redirecionamento inesperado foi aceito no teste. Isso valida os arquivos exercitados, não equivale a perícia completa de toda a VM.

A marcação do Safe Browsing pode explicar avisos de perigo no Chrome. **A sequência nativa “Salvar senha” → faixa persistente no PWA instalado não foi reproduzida**, portanto não se afirma causalidade completa dessa sequência. Uma origem fora do escopo também pode fazer o Chrome mostrar uma faixa; não ocorreu navegação fora do domínio nos testes realizados. Referência: [Chrome: escopo e UI de origem em PWAs](https://developer.chrome.com/docs/capabilities/scope-extensions).

O Chrome pode exibir UI de origem, salvamento de senha ou segurança mesmo num PWA instalado. CSS/JavaScript do site não controlam nem removem essa UI. Não foi desabilitada validação TLS, Safe Browsing, salvamento de senhas ou inspeção de segurança; não foram implementadas tentativas de mascarar alertas ou forçar tela cheia para escondê-los. Não foi enviado pedido de revisão ao Google nesta intervenção.

## Correções no aplicativo

1. Senha e login agora usam erro dentro do formulário, com botão de fechar. A validação deixa de usar balões nativos `reportValidity` nesses dois formulários.
2. A confirmação de senha podia ficar inválida ao corrigir somente o primeiro campo: `setCustomValidity` era limpo apenas ao editar a confirmação, e o navegador bloqueava o submit antes do handler. O novo fluxo verifica os valores no submit e limpa a indicação ao editar qualquer campo.
3. Erro de servidor/rede preserva os campos e libera o botão para nova tentativa, sem fechar/reabrir o app nem navegar para outra URL.
4. Toasts têm fechamento manual. Ao retornar o foco, mensagens já expiradas são removidas mesmo se o navegador tiver atrasado timers em segundo plano.
5. O aviso de desconexão é reconciliado em foco, pageshow e retorno à visibilidade, além dos eventos online/offline.

Essas correções resolvem os avisos controlados pelo app; **não retiram a classificação do endereço no Google nem garantem desaparecimento da moldura nativa de segurança do Chrome**. A solicitação de manter sempre uma tela sem UI de navegador não pode ser garantida por um PWA quando o navegador precisa apresentar um aviso de segurança.

## Validação e limites

- `scripts/check-ui-password-feedback.mjs`, resultado `docs/pilot-results/ui-auth-feedback.json`: erros de login dispensáveis, valores preservados, correção só da primeira senha, falha HTTP 500 e retry, URL estável, zero diálogos JS e zero erros não tratados.
- `scripts/check-browser-feedback.mjs`, resultado `docs/pilot-results/browser-feedback.json`: HTTPS em Chrome com perfil novo, sem ignorar TLS; testes locais de fechar toast, expiração ao retomar foco e atualização do aviso offline.
- `scripts/check-published-integrity.mjs`, resultado `docs/pilot-results/published-integrity.json`: comparação com build limpo da revisão publicada anterior às correções de interface.

O Chrome de teste viu uma CA do Bitdefender, evidenciando inspeção TLS no computador acessível. Não foi desativada e não se conclui que ela seja a causa do comportamento descrito. O teste automatizado em perfil isolado/headless não reproduz a moldura do PWA instalado nem o pop-up nativo do gerenciador de senhas. Nenhuma senha real de participante foi usada ou armazenada nesses testes. Os casos de erro e retry foram testados em ambiente mock local.
