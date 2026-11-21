# Plano — Ritmo Saúde (aplicativo independente)

## Objetivo

Criar neste repositório um aplicativo independente de saúde, separado do Super App financeiro. A primeira versão terá uma tela de login e dois módulos internos: **Dieta** e **Água**. O primeiro incremento será uma estrutura funcional com autenticação e repositórios mockados, para validar navegação e fluxos antes de escolher/implementar a persistência definitiva.

Mensageria fica fora da V1 e entra somente numa V2. Não haverá módulo financeiro nem dependência da shell, contas, permissões ou dados financeiros do Super App.

## Decisões iniciais

- **Produto separado:** repositório e identidade visual próprios, sem menu financeiro ou integração obrigatória com o Super App.
- **Escopo V1:** login, shell autenticada, Dieta e Água.
- **Stack inicial:** Node.js 24, JavaScript ES modules, Express 4 e Vite 8, alinhada à stack do Super App sem carregar a shell integrada.
- **Dados mock primeiro:** Administração cadastra contas Professor/Aluno e gerencia acesso; professor seleciona alunos ativos para gerenciar dietas e água; aluno consulta planos e registra consumo. Administração também consulta observabilidade agregada da API local. Persistência em memória.
- **Persistência mock:** store em memória no servidor; reiniciar o servidor restaura as fixtures e encerra a sessão demonstrativa. É somente modo local, sem promessa de segurança ou sincronização. Dados de demonstração não são dados de usuários reais.
- **Evolução do banco:** depois da estrutura mock, executar contra PostgreSQL local na VM com schema e migrações próprios; manter o modelo compatível com PostgreSQL do Supabase. O primeiro ambiente compartilhado/homologação será um projeto Supabase dedicado ao produto, sujeito à configuração de Auth e RLS.
- **Mensageria:** fora da V1. Preparar somente fronteiras de serviço que permitam integração futura, sem bot, cron, WhatsApp, Telegram ou envio de alertas agora.
- **Saúde e privacidade:** não copiar contas nem registros de saúde do Super App automaticamente. Tratar peso, dieta, ingestão e demais informações como dados pessoais sensíveis; separar fixtures e variáveis de ambiente de qualquer dado real.

## Leitura da base existente

O módulo Saúde do Super App oferece lógica e interface úteis, mas não é um pacote independente pronto para copiar integralmente:

- `features/saude/service/dietasService.js`: normalização de refeições, semana alimentar e datas; candidato a reaproveitamento após revisão.
- `features/saude/service/waterIntakeService.js`: validação de quantidades e metas de água; candidato a reaproveitamento após revisão.
- `features/saude/service/alimentosService.js` e `features/saude/data/alimentosNutricionais.js`: regras e catálogo nutricional; avaliar seleção para a V1, evitando trazer catálogo ou telas que não forem necessárias.
- `features/saude/index.js`: interface extensa que importa serviços e depende de `globalThis.superApp`, checkpoint da shell, estilos e confirmação global. Reaproveitar comportamentos e regras pontuais, não transplantar a tela inteira como módulo independente.
- `api/saude.js`: concentra autenticação com `appId: 'saude'`, CRUD de perfis, medidas, dietas, água, alertas e outros recursos. O caminho offline usa arrays e Maps em memória; perde alterações ao reiniciar e não representa PostgreSQL.
- `lib/auth.js` e `lib/supabase.js`: estão ligados à sessão, permissões e configuração do Super App; não devem ser dependências da nova aplicação.
- `migration/20260926_reset_modulo_saude.sql` e migrações subsequentes: servem como referência para domínio e constraints, não para aplicação automática. O reset contém operações destrutivas e pressupõe objetos compartilhados do Super App.

## Arquitetura alvo da V1 mock

Manter a estrutura pequena e substituível, ajustando nomes ao stack escolhido durante a implementação:

```text
index.html              # shell HTML
api/                    # handlers HTTP (auth e saúde)
features/
  app.js                # inicialização e coordenação do frontend
  auth/                 # login e serviço de sessão mock
  saude/
    index.js            # interface dos módulos Dieta e Água
    data/                # store e fixtures fictícias
    service/             # regras puras e casos de uso de saúde
lib/                    # infraestrutura compartilhada
styles/                 # CSS por domínio
supabase/migrations/    # schema futuro, versionado e não aplicado
```

O mock deve ficar atrás de contratos simples, por exemplo `AuthProvider`, `DietRepository` e `WaterRepository`. Os componentes conversam com casos de uso/serviços e estes usam os contratos. Na V1, as implementações apontam para `data/mock`; nas fases seguintes, os mesmos contratos podem apontar para PostgreSQL e Supabase. Não criar camada genérica ou framework de plugins além do necessário para essa troca.

Implementação inicial registrada: API Express local, organizada em handlers de `api/`, store em memória em `features/saude/data/`, módulos de domínio em `features/` e regras puras reaproveitadas em `features/saude/service/`. Vite serve a interface local na porta 5199 e encaminha `/api` para o Express em 5198. O servidor segue o padrão Node/Express do Super App. A migration de referência está em `supabase/migrations/20261120000000_initial_health_modules.sql`; ainda não foi aplicada.

### Fluxo mínimo

1. A rota inicial mostra login e valida credenciais demonstrativas documentadas para desenvolvimento.
2. A sessão abre Administração, Professor ou Aluno conforme seu papel.
3. O professor monta uma dieta mock e ela aparece na visão do usuário associado. O usuário não marca refeições como concluídas.
4. O aluno registra água e o professor acompanha seus alunos.
5. Reiniciar o servidor restaura os mocks e encerra a sessão; a interface e a documentação identificam claramente que não é persistência real.

O plano de V1 não inclui perfis familiares avançados, peso/IMC, treinos, agenda, notificações, sincronização offline real, exportação, nem importação/migração dos dados existentes.

## Fases de execução

### Fase 0 — Estrutura e experiência mock

- Escolher a stack mínima para o repositório; confirmar o conteúdo atual antes de criar boilerplate.
- Criar layout autenticado, login demonstrativo, navegação e estados vazio/carregando/erro.
- Criar fixtures pequenas e fictícias de dieta e hidratação, sem dados identificáveis.
- Implementar os contratos e adaptadores mock separados dos componentes.
- Criar fluxos CRUD essenciais de dieta e registro/meta de água para tornar o mock navegável e demonstrável.
- Documentar como iniciar o modo mock e como zerar seus dados.

**Pronto quando:** login/logout demonstrativos funcionam; Dieta e Água podem ser percorridos com dados fictícios; nenhuma tela ou rota financeira aparece; componentes não acessam fixtures diretamente; o modo mock é reconhecível e seus limites estão documentados.

### Fase 1 — PostgreSQL local na VM

- Definir schema próprio do produto, migrações versionadas, seeds exclusivamente fictícios e rotina de reset segura para ambiente local.
- Modelar somente o necessário: usuário/owner, perfil mínimo se o fluxo exigir, plano/refeições de dieta e meta/registros diários de água.
- Implementar adaptadores PostgreSQL atrás dos mesmos contratos e configurar acesso por ambiente, sem credenciais no Git.
- Manter autorização no servidor e testar isolamento entre usuários antes de usar dados reais.

**Pronto quando:** a aplicação local persiste após reiniciar; migrações e seed podem ser aplicados a uma base vazia; dois usuários de demonstração não conseguem ler ou alterar dados um do outro.

### Fase 2 — Supabase dedicado

- Criar/configurar projeto Supabase próprio, Auth e migrations revisadas para esse projeto; não reutilizar automaticamente o projeto ou schema do Super App.
- Integrar login real e políticas RLS por `auth.uid()`; chaves privilegiadas ficam apenas no servidor e segredos ficam fora do repositório.
- Homologar fluxo de recuperação/expiração de sessão, isolamento, backups e exclusão de conta antes de onboarding de interessados.
- Decidir explicitamente se o adaptador de produção falará com Supabase por API server-side ou SDK autorizado por RLS; não misturar credenciais privilegiadas no browser.

**Pronto quando:** ambiente de homologação isolado funciona com contas reais de teste, RLS impede acesso cruzado e o modo mock não é alcançável por configuração de produção.

### Fase 3 — V2 e além

- Avaliar mensageria e lembretes como escopo separado, com consentimento, preferências, controles de envio e proteção contra duplicidade.
- Planejar migração de dados apenas se houver decisão explícita sobre quais dados e usuários serão transferidos. Não copiar automaticamente dados de produção do Super App.

## Critérios transversais

- Sem importações de `index.html`, `globalThis.superApp`, `lib/auth.js` ou `lib/supabase.js` do Super App.
- Sem dependência ou consulta a tabelas financeiras.
- Contratos de dados e ownership definidos antes de conectar um banco real.
- Segredos fora do Git; nenhuma service-role key no frontend.
- Mensagens de erro não expõem SQL, tokens ou dados de outros usuários.
- Separar seeds de demonstração de quaisquer dados reais e permitir reset local deliberado.
- Revisar migrations legadas antes de adaptar constraints; nunca executar `20260926_reset_modulo_saude.sql` diretamente no projeto novo, pois é um reset destrutivo acoplado ao Super App.

## Riscos e decisões pendentes para a implementação

1. **Login mock versus login real:** a Fase 0 usa credencial demonstrativa; login de interessados só deve ser habilitado após Supabase Auth e isolamento de dados estarem prontos.
2. **PostgreSQL na VM:** confirmar conectividade, backup e modo de execução antes da Fase 1. PostgreSQL local isolado não reproduz automaticamente Auth, PostgREST nem RLS do Supabase.
3. **Migration Supabase:** a migration inicial separa planos/refeições/itens, além de metas e registros de água. Revisar ownership, modelo semanal e timezone antes de aplicar num projeto Supabase dedicado; ela não contém dados seed/mock.
4. **Reuso visual e de regras:** transportar somente componentes e funções revisados; a UI atual carrega responsabilidades além de Dieta e Água e foi construída para a shell integrada.
5. **Uso em saúde:** conteúdo de dieta deve ser apresentado como organização do usuário, sem prescrição clínica implícita. Qualquer recomendação clínica exige escopo e revisão apropriados.

## Próximo passo recomendado

Primeiro incremento: implementar e revisar visualmente a Fase 0 neste repositório. Manter o banco real e a mensageria fora da execução inicial; manter a migration futura sem aplicação automática.

## Decisões atualizadas — contas, entrada e mensageria

- Administração: cadastro, leitura, edição, exclusão e ativação de contas Professor/Aluno. Conta administrativa protegida contra exclusão e mudança de papel.
- Senha inicial mock 12345 para as três contas e novos cadastros; troca obrigatória no servidor antes de acessar qualquer módulo. Nova senha pessoal com 8 a 80 caracteres.
- Saudação com nome, fundo opaco e duração mínima de aproximadamente 3 segundos, aguardando também o carregamento autorizado dos dados.
- Mensageria V2: mesmo número, conector/worker compartilhado. Preparar isolamento por app de origem, destinatário, permissões, credenciais de integração e callbacks, com limites/fairness de fila e observabilidade. Não iniciar outra instância compartilhando o diretório da sessão.
- Capacidade: avaliar VM com 4 GB de RAM e revisar o limite de memória do container junto com testes de carga. Nenhuma alteração na VM ou no worker foi aplicada nesta etapa.

## Portfólio do professor

- Início com seletor de alunos disponíveis e acesso ao plano/água do aluno escolhido.
- Portfólio privado por professor com CRUD de modelos diários ou semanais, com refeições e itens individuais.
- Atribuição ao aluno por cópia editável; alterações posteriores no modelo não devem modificar o plano do aluno.
- Fixtures: cinco alunos sem dieta e três modelos. Não incluir dados pessoais do Super App.
- Migration futura `20261120000001_diet_templates.sql`, não aplicada.
