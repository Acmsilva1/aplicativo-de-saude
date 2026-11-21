# Testes mobile e PWA — 20/11/2026

## Verificações executadas

- UI no navegador em 390×844 e 320×740: navegação de Admin/Professor/Aluno, sem overflow horizontal após correção do min-width do body.
- Admin: cadastro de aluno por formulário e consulta de contas/observabilidade.
- Professor: criação, leitura, edição e exclusão de dieta pela UI; configuração de meta de água.
- Aluno: nova meta refletida na tela; registro de 200 ml atualizou total, porcentagem e histórico.
- Campos do editor com 16px; modal de dieta dentro da viewport; controles visíveis medidos com ao menos 44px de altura.
- Confirmação de exclusão trocada por dialog acessível do app, com foco inicial em Cancelar.
- Build Vite e geração de service worker passaram.
- Build servido temporariamente em localhost:5200: service worker com estado activated, scope / e nenhum erro de console observado.
- Manifest standalone, ícones e 10 recursos de precache responderam HTTP 200. Rotas /api/ excluídas do cache.

## Limites

- Viewports de navegador; instalação e teclado reais em iOS/Android ainda não testados.
- Sem teste de modo avião em aparelho físico. O cache oferece apenas a interface; dados de saúde e autenticação exigem conexão.
- Service worker registrado apenas no build; desenvolvimento usa HMR sem cache persistente.
- Contas e dados permanecem mock em memória. Produção mantém APIs mock desativadas.
- Reinício final restaura as três contas originais e remove dados temporários dos testes.

## Complemento — primeiro acesso e contas

- API verificada: senha padrão 12345, bloqueio dos módulos antes da troca, rejeição da senha inicial na troca, rotação de sessão, CRUD de contas e proteção da conta administrativa.
- UI verificada: saudação com nome antes da área autenticada, formulário de edição de conta e tela de troca obrigatória. Troca de senha verificada pela API com dados mock; senha final de cada pessoa deve ser definida por ela.
