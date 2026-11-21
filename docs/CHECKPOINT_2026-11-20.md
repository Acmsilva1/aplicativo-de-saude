# Checkpoint — Ritmo Saúde — 20/11/2026

Estado: implementação pausada a pedido do usuário. Este arquivo é um checkpoint documental; nenhum commit ou stash foi criado.

## Workspace e referências

- Projeto: C:\projetos e aplicativos\pessoal\aplicacao de saude\aplicativo-de-saude
- Base: C:\projetos e aplicativos\pessoal\super-app-retorno-vercel
- Padrão oficial confirmado por leitura no container super-app da VM; arquivos de referência baixados para %TEMP%\ritmo-vm-saude.js e %TEMP%\ritmo-vm-bank.css.
- Não houve alteração de produção/worker nesta etapa. Somente leitura e cópia de arquivos de interface/catálogo.

## Base já entregue antes do trabalho atual

- Node/Express/Vite, arquitetura api/features/lib/styles e app mobile/PWA.
- Fundos originais de Saúde e componente waterDropVisual.js da VM.
- Administração: cadastro, edição, exclusão e controle de acesso; observabilidade agregada local.
- Professor: selecionar alunos disponíveis e gerenciar dietas/metas de água. Aluno: consultar dieta, meta e registrar consumo.
- Senha inicial 12345 e troca obrigatória antes de qualquer módulo, com bloqueio também no servidor.
- Saudação nominal sobre fundo opaco, por pelo menos aproximadamente três segundos enquanto carrega.
- Seleção do perfil no login altera título, orientações, rótulos, botão e destaque da opção escolhida.
- PWA: manifest, ícones, geração de service worker no build; APIs excluídas do cache. SW somente no build, não no Vite dev.
- Testes anteriores de UI em 320px/390px e API registrados em docs/TESTES_MOBILE_PWA.md. Esses testes NÃO validam automaticamente o editor novo em andamento abaixo.

## Pedido atual

1. Início do Professor com dropdown dos nomes dos alunos e resumo só do escolhido.
2. Portfólio de dietas reutilizáveis, com criação/edição/exclusão e cópia personalizável para aluno sem alterar o modelo.
3. Pelo menos cinco alunos cadastrados SEM dieta e três modelos diferentes salvos.
4. Editor fiel ao Super App: adicionar/editar/remover cada alimento em cada refeição, escolhendo no catálogo, sem textarea com itens separados por texto.
5. Dois formatos: Fixa — repetir todos os dias; Semanal — segunda a domingo. Disponíveis nos modelos e nos planos atribuídos.

## Implementado no trabalho atual

### Backend e fixtures

- features/auth/service/mockAuthService.js: cinco alunos André (aluno@saude.local), Ana, Bruno, Carla e Diego (nome@saude.local). Mais Admin e Professor: agora são SETE contas iniciais, substituindo o requisito antigo de três contas totais.
- Todos os alunos começam sem dieta e sem meta; senha inicial 12345, troca obrigatória.
- features/saude/data/mockSaudeStore.js: modelos separados por professor, CRUD e cópia profunda; três fixtures de portfólio (diária, vegetariana e semanal); normalização preserva alimento_id, quantidade_valor/unidade e observacao.
- api/saude.js: professor-portfolio GET/POST/PATCH/DELETE antes da validação do aluno-alvo; ownership deriva da sessão, não do cliente.
- api/saude.js: professor-alimentos GET retorna foods com IDs numéricos estáveis do source_order.
- Copiados da VM: features/saude/data/alimentosNutricionais.js (121 alimentos) e features/saude/service/alimentosService.js.
- supabase/migrations/20261120000001_diet_templates.sql: artefato futuro do portfólio, com ownership/RLS. NÃO aplicado ou validado em PostgreSQL.

### Estado/contratos frontend

- features/app.js: state.templates, template, templateDraft, foods; professor carrega portfólio e catálogo.
- onSaveTemplate(payload): POST sem id; PATCH com id, depois portfolio.
- onDeleteTemplate(id): DELETE, depois portfolio.
- onUseTemplate(id): clona modelo sem id, load(createDiet), atribui state.templateDraft e renderiza.
- load(template-detail/editTemplate,targetId) interpreta ID do modelo sem alterar selectedUserId; createTemplate zera state.template.
- features/saude/index.js está com alterações EM ANDAMENTO do agente: dropdown, portfólio, formatos fixa/semanal e modal local item-a-item. Foi interrompido; não considerar integração pronta.

## Validações executadas para o trabalho atual

- API: cinco alunos com diet_count=0; três modelos incluindo semanal; catálogo de 121 alimentos.
- API: criação/edição/exclusão de modelo; atribuição de cópia ao aluno não altera modelo original; aluno recebe 403 no portfólio.
- node --check passou em features/saude/index.js, features/app.js e api/saude.js no momento deste checkpoint.
- git diff --check sem erro, apenas aviso de conversão LF/CRLF no README.
- NÃO houve build final nem teste UI completo das últimas mudanças de portfólio e alimentos item-a-item.

## Pendências concretas ao retomar

1. Finalizar/revisar features/saude/index.js e CSS do editor de itens: eventos adicionar/editar/remover, modal de item sobre editor principal, manter dados e horários ao abrir/fechar item, salvar somente no plano/modelo correto.
2. Remover globalThis.confirm restante no seletor de modelos (duas ocorrências observadas) e usar confirmAction async. Confirmações nativas já bloquearam os testes anteriormente.
3. Se necessário estender features/saude/service/uiConfirmation.js para aceitar título opcional (atualmente título fixo Confirmar exclusão; substituição de rascunho precisa título adequado).
4. Limpar state.dietDraft/foodItemContext e templateDraft de forma consistente em iniciar nova dieta/modelo, cancelar, salvar e logout. Atualmente UI nova usa state.dietDraft, mas app.js ainda não o inicializa/limpa. Evitar herdar rascunho de outro aluno ou modelo.
5. Conferir contrato onUseTemplate: root recria editor com state.templateDraft; não deixar rascunho antigo sobrescrever a cópia. Se usuário já digitou, pedir confirmação antes de substituir. Escolha de aluno deve permanecer correta.
6. Conferir IDs de template nas navegações e payloads de editTemplate/createTemplate; nenhuma operação de modelo deve exigir ou enviar user_id de aluno.
7. Conferir receitas fixa/semanal nos três modelos e nos planos: sete dias independentes, sem replicação indevida. Listas ainda podem rotular fixa como Diária: alinhar se necessário.
8. Revisar fixtures enriquecidas com IDs de alimentos: parte delas foi ajustada DEPOIS do último reinício; processo em execução pode não refletir os arquivos atuais.
9. Testar UI mobile: dropdown dos cinco alunos, três modelos, criar/editar/remover item, quantidade/unidade, observações, persistência de horário, trocar formato, CRUD modelos, usar modelo para aluno e confirmar independência.
10. Executar npm run build e testes de API novamente após ajustes; registrar resultados reais.
11. Reiniciar Vite/Express para restaurar fixtures e senhas, removendo dados de teste. Não reiniciar a VM/worker.

## Runtime local ao pausar

- Vite http://localhost:5199 e API http://127.0.0.1:5198; última sessão exec de dev: 34320 (confirmar se ainda existe antes de usá-la).
- Durante os testes API, as senhas mock de Professor e Aluno foram alteradas temporariamente; reiniciar o servidor restaura as fixtures em disco.
- Navegador pode estar em tela antiga; recarregar após reinício. Sessões são em memória.
- Agente proximos_passos interrompido; editava exclusivamente features/saude/index.js/CSS. Ao retomar, revisar o arquivo atual antes de delegar ou sobrescrever.

## Mensageria — decisão futura, sem implementação

- Usuário decidiu manter o mesmo número e reforçar o worker/conector existente para os dois apps.
- Separar app de origem, destinatários, permissões, deduplicação e destino de callbacks; controlar fila por app para preservar o Super App.
- Avaliar VM de 4 GB e limite de memória do worker com testes de carga. Última leitura: VM 1 vCPU/~2 GB; worker ~701 MiB de limite 800 MiB. Isso é um retrato, não capacidade comprovada.
- Nenhuma mudança na mensageria está autorizada como parte da implementação local atual.
