# Avaliação mínima do piloto — Ritmo Saúde 1.0.0

Data: 21/11/2026, horário de Brasília. Público pretendido: 1 professor e 10 alunos, por 30 dias.

## Parecer

Os testes realizados sustentam um **piloto controlado de 11 participantes** após as correções publicadas. Não constituem certificação de segurança nem um ensaio de disponibilidade por 30 dias.

Após esta auditoria, foi configurado backup adicional criptografado na VM, diário às 00:00 de Brasília e com retenção de 30 dias. A restauração dos schemas public/auth foi testada em banco isolado. O usuário confirmou a cópia oficial do Supabase; a restauração dessa cópia gerenciada não foi executada aqui. Ver [rotina de backup e monitoramento](BACKUP_E_MONITORAMENTO.md). Definir responsável pelo acompanhamento de erros durante o piloto.

## Checklist

| Controle | Resultado / condição |
| --- | --- |
| Aluno A não acessa dados de B via REST direto | PASS: perfis, papéis, planos, refeições, itens, metas e registros de água |
| Professor sem vínculo não acessa aluno | PASS na API e nas tabelas exercitadas diretamente |
| Dados legítimos continuam acessíveis | PASS: plano ativo e meta do próprio aluno; professor vinculado lê os dois planos |
| Plano OFF não aparece nem pelo REST | PASS após migration, incluindo refeições e itens |
| Admin gerencia acesso sem consultar saúde | PASS API e RLS para planos/metas de terceiros |
| Aluno não se promove a admin / grava água para colega | PASS |
| Primeiro acesso e bloqueio de contas | PASS; troca obrigatória antes de consultar saúde; sessão de conta bloqueada recusada; reativação funciona |
| Senha temporária e recuperação | Senha única de 24 caracteres; ícone de cópia enquanto primeiro acesso pendente; após troca pessoal, botão explícito Resetar senha no CRUD admin volta a conta ao estado de troca obrigatória |
| HTTPS / cookies | HTTPS público respondeu 200; HttpOnly, Secure, SameSite=Strict; CSP, HSTS, nosniff e proteção contra iframe verificados |
| API não armazenada no cache | Cache-Control: no-store |
| Segredos | .env root:root 600; nenhum segredo testado encontrado no build ou nas rotas públicas sondadas |
| Credenciais de manutenção | DATABASE_URL e BOOTSTRAP_ADMIN_* separados em /etc/ritmo-saude/maintenance.env, diretório 700, arquivo 600; retirados do runtime permanente |
| Container | USER node, rootfs somente leitura, /tmp em tmpfs, capabilities ALL removidas, no-new-privileges, 128 PIDs, memória limitada a 384 MiB |
| Dependências de produção | npm audit --omit=dev: zero vulnerabilidades conhecidas na consulta realizada |
| Carga autenticada 11 usuários | PASS: 660 requisições, zero erros, totais de água exatos |
| UI desktop/mobile | PASS Chromium em 390 e 1366 px; cinco telas reais sem overflow e zero erros JS não tratados |
| Backup e restauração | PASS da cópia adicional local: public/auth restaurados em PostgreSQL isolado; timer diário 00:00 Brasília e retenção 30 dias |
| Deploy automático | PENDENTE: runner/script da pipeline anteriormente ausentes; publicações deste trabalho feitas por SSH e Compose |
| Disponibilidade por 30 dias | NÃO ENSAIADA; exige acompanhamento durante o piloto |

## Carga e performance

Carga aplicada ao HTTP loopback da aplicação na VM, usando Supabase real e sessões autenticadas. Portanto, os números de carga incluem o banco remoto, mas não o trecho de internet do celular/desktop até a VM. A UI foi verificada separadamente no HTTPS público. Foram usadas contas sintéticas, sem alterar dados dos participantes.

| Métrica | Antes | Após correções |
| --- | ---: | ---: |
| Usuários simultâneos | 11 | 11 |
| Requisições da carga | 132 | 660 |
| Duração | 18,74 s | 88,83 s |
| Vazão | 7,0 req/s | 7,4 req/s |
| p50 | 1.147 ms | 1.128 ms |
| p95 | 1.911 ms | 1.472 ms |
| p99 | 2.290 ms | 1.674 ms |
| Máximo | 2.626 ms | 2.031 ms |
| Erros na carga | 0 | 0 |
| Gravações de água | 30 | 150 |

As rodadas têm tamanhos diferentes; não são comparação causal isolada das correções. Na rodada final: 60 leituras do professor, 300 leituras de água, 150 leituras de dieta e 150 gravações de água. Pausa de 250 ms entre requisições de cada usuário, em 60 rodadas. Mais chamadas de autenticação, autorização, integridade e RLS ocorreram fora das 660 requisições.

UI real durante a carga: login até início pronto em 1.931 ms para professor e 2.722 ms para aluno. GETs observados: professor 656–1.089 ms; aluno 1.058–1.555 ms. Não foi baixado o catálogo alimentar ao abrir início/água após a correção.

UI local com falha/latência controlada: água atualizou em 3,3 ms no evento de clique, antes da rede artificialmente atrasada em 750 ms. Um HTTP 500 reverteu a mudança e exibiu erro. Esse número mede a resposta local otimista, não a confirmação do banco.

VM compartilhada observada: aproximadamente 2 GiB de RAM total, 1,3 GiB disponíveis no início, disco 45% ocupado. Amostras do container durante ensaios foram aproximadamente 119–135 MiB / 384 MiB; após ensaios, aproximadamente 93 MiB. São amostras pontuais, não pico instrumentado. Outros containers não foram reconstruídos ou reiniciados por este trabalho.

## Falhas encontradas e corrigidas

1. **RLS de dietas ocultas:** aluno podia consultar seus planos OFF e filhos pelo REST, apesar da UI ocultar. Corrigidas policies por status e vínculo de plano/refeição.
2. **Privilégio administrativo de saúde:** policies davam ao admin acesso direto a saúde de terceiros, contrariando a separação de funções. Removido esse bypass; gestão de contas preservada.
3. **Conta bloqueada não reativava:** consulta administrativa descartava a própria conta bloqueada. Corrigida leitura de conta desativada somente nas operações administrativas apropriadas.
4. **Autenticação concorrente:** singleton anônimo mutável compartilhava estado de sessão; substituído por clientes efêmeros nos fluxos de login/refresh/troca.
5. **Rate limit contornável:** confiava no primeiro X-Forwarded-For bruto e não reservava tentativas antes da rede. Agora usa req.ip do proxy confiável, reserva concorrente, limita conta+IP e agregado IP, com expiração e teto de memória. Testado pelo proxy HTTPS com header adulterado.
6. **Logout:** agora solicita encerramento da sessão local no Supabase e limpa cookie. Um JWT de acesso já emitido pode continuar válido até sua expiração normal; não alegar revogação instantânea universal.
7. **Perda de consistência otimista:** edição falha seguida de troca On/Off podia reaplicar título não salvo. Projeções agora alteram apenas os campos da própria ação; teste de regressão reproduz e valida a correção.
8. **Espera excessiva:** navegação aguardava todos os salvamentos e baixava catálogo/portfólio sem necessidade. Espera passou a ser seletiva; catálogo somente nas telas consumidoras; timeout do cliente em 20 s, sem retry automático de gravações.
9. **Exclusão de professor vinculado:** guard antes de qualquer remoção impede excluir professor com aluno ativo ou bloqueado. É necessário remanejar alunos antes de excluir.
10. **Falso sucesso ao excluir meta:** erro de DELETE agora é propagado; a interface não confirma operação rejeitada pelo banco.
11. **Segredos e execução:** credenciais de bootstrap/SQL retiradas do runtime e container endurecido; APIs recebem no-store; cookie malformado passa a ser recusado sem 500.
12. **Senha inicial previsível:** substituída por senha criptograficamente aleatória e única de 24 caracteres em contas novas, com troca obrigatória. A senha temporária aparece no diálogo do administrador, não em logs ou relatórios. Contas existentes não têm senhas alteradas automaticamente.
13. **Recuperação administrativa de senha:** ícone de cópia no cadastro gera uma NOVA senha temporária após confirmação, invalidando o login com a anterior. Depois da troca pessoal, o ícone é substituído pelo botão explícito Resetar senha. Somente administrador pode redefinir uma conta ativa de professor/aluno para senha provisória; o servidor exige nova troca antes de consultar saúde. Falha ao marcar a troca obrigatória impede alterar a senha; erro ou timeout na substituição mantém a troca obrigatória para evitar senha provisória sem restrição. Não há recuperação pública no login nem senha legível guardada para consulta. Clipboard negado oferece seleção manual. JWT já emitido segue a ressalva de expiração descrita no item 6.

A inspeção sanitizada final encontrou zero contas com primeiro acesso pendente e zero contas com digest da senha inicial fixa antiga. Nenhuma senha dos participantes existentes foi alterada.

Recuperação após esquecimento: **Admin → Contas → usuário → Resetar senha → confirmar → copiar a senha provisória** e entregar ao titular por canal privado. No próximo login, o usuário escolhe outra senha pessoal de 8 a 80 caracteres. A ação é restrita ao administrador e não reativa conta pausada. O perfil de administrador permanece protegido contra reset por essa ação; recuperação do próprio administrador continua com o responsável pelo projeto Supabase. Não há link público “Esqueci minha senha”.

Migration aplicada no PostgreSQL real: `supabase/migrations/20261121000000_pilot_rls_hardening.sql`, em transação. As nove tabelas health observadas estavam com RLS habilitada. A API usa service_role no servidor; essa credencial contorna RLS, por isso foram necessários testes tanto da API quanto do REST com tokens de usuário, e não apenas inspeção do SQL. Referência: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Evidências e repetição

Relatórios sanitizados em `docs/pilot-results/`:

- `before.json`: cenário inicial, três falhas de RLS reproduzidas.
- `ritmo-pilot-after.json`: 40 verificações aprovadas e carga final.
- `ritmo-runtime-audit.json`: 16 verificações de headers, cookies, exposição e rate limit aprovadas.
- `ui-mock.json`: oito verificações locais, incluindo latência e rollback.
- `ui-production.json`: UI HTTPS real e tempos registrados.
- `ritmo-crud-audit.json`: CRUD autenticado real com contas sintéticas e limpeza.
- `ritmo-crud-audit-final.json`: nova rodada com senhas únicas e recuperação, sem valores das senhas.
- `ui-temporary-password.json`: evidência histórica da regra inicial de primeiro acesso; substituída para recuperação pessoal pelo teste `ui-admin-password-reset.json`.
- `ritmo-access-audit.json`: contagens de primeiro acesso e ausência de credenciais de manutenção no runtime.

Testes locais: `node scripts/check-security.mjs` e `node scripts/check-background-saves.mjs`. Build: `npm run build`. `npm audit --omit=dev` consulta a base de vulnerabilidades atual; resultado muda ao longo do tempo.

UI: Playwright não foi acrescentado às dependências do produto. Scripts `check-ui-mock.mjs` e `check-ui-pilot.mjs` aceitam PLAYWRIGHT_MODULE e CHROMIUM_PATH. O mock só aceita localhost, usando servidor separado nas portas 5299/5298 com FORCE_MOCK=true. O script de UI real lê somente as credenciais sintéticas em memória por SSH; não imprimir esse arquivo.

Os scripts `pilot-audit.mjs` e `pilot-crud-audit.mjs` criam contas reais temporárias: executar somente em ambiente autorizado, com as variáveis já protegidas na VM. O primeiro usa fases setup, enrich, test e cleanup; AUDIT_ROUNDS controla 12–120 rodadas. Cleanup é obrigatório inclusive quando algum teste falhar. O CRUD tem cleanup em finally. Não versionar fixtures, cookies ou tokens.

Inspeção SQL: `pilot-db-audit.mjs` requer cliente pg instalado temporariamente em /tmp/ritmo-audit-tools e DATABASE_URL no processo de manutenção. A URL não fica mais no app permanente. Para manutenção, usar processo separado e os arquivos env protegidos; não recolocar senha do administrador no Compose. As opções de runtime correspondem aos controles documentados em [Docker run](https://docs.docker.com/engine/containers/run/).

## Limites e acompanhamento por 30 dias

- Não foram executados teste de endurance por 30 dias, simulação de todos os históricos possíveis, restauração no Supabase de produção, pentest independente completo ou certificação LGPD.
- A carga foi controlada e curta, com um único professor ativo e dez alunos; não demonstra capacidade para escala maior ou ataques de negação de serviço.
- A VM tem SSH público e firewall UFW/fail2ban inativos no retrato observado. As portas de aplicativos estavam ligadas a loopback; não alterei firewall/SSH globais da VM compartilhada. Restringir administração por chave/IP exige planejamento conjunto para não perder acesso aos outros projetos.
- Monitorar erros da API, atrasos de gravação, memória e espaço durante o piloto. As métricas atuais são em memória e reiniciam com o container; não equivalem a histórico permanente de 30 dias.
- Salvamento em segundo plano não é uma fila offline persistente: fechar/encerrar o aplicativo pode interromper operações. A interface alerta ao tentar fechar com gravações pendentes. Em timeout, consultar os dados antes de repetir para evitar duplicação.
- Fazer o onboarding de contas novas com entrega privada da senha temporária e troca no primeiro acesso. Senhas de contas já distribuídas não são recuperadas em texto; não guardar cópias em planilhas ou relatórios.
- Backup adicional local restaurado em ensaio isolado, conforme runbook. Antes da distribuição: definir responsável pela revisão diária de erros. Durante o piloto: registrar versão, horário, perfil e ação ao relatar falhas, evitando compartilhar dados de outros participantes.
