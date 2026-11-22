# Backup local e monitoramento do Ritmo Saúde

Configurado em 21/11/2026, horário de Brasília. Complementa os backups oficiais do Supabase informados pelo responsável pelo projeto.

## Rotina instalada

- Timer: `ritmo-saude-backup.timer`, diário às **00:00 America/Sao_Paulo**, correspondente a 03:00 UTC na configuração atual da VM.
- `Persistent=true`: se a VM estiver desligada no horário, a execução perdida é recuperada ao reativar o timer. `AccuracySec=1s`, sem atraso aleatório.
- Serviço: `ritmo-saude-backup.service`, execução única com timeout de 15 minutos, prioridade reduzida e trava para impedir sobreposição.
- Programa: `/usr/local/sbin/ritmo-saude-backup`, instalado a partir de `ops/backup/ritmo-backup.py`.
- Volume Docker **local**: `ritmo-saude-backups`, independente do container e do Compose da aplicação. Não é apagado ao recriar o app.
- Retenção: cópias concluídas de até 30 dias; as vencidas são removidas somente depois de uma nova cópia validada. Arquivo antigo não é sobrescrito em falhas.

## Conteúdo e proteção

Cada cópia contém:

1. Dump custom PostgreSQL dos schemas `public` e `auth`: dados de saúde, papéis/vínculos, funções/policies, perfis, usuários e estruturas de autenticação.
2. Configuração protegida de runtime/manutenção (`.env` e `maintenance.env`), Compose, Dockerfile, migrations e revisão implantada.
3. Manifesto com data UTC/Brasília, schemas, formato e retenção.

O archive inteiro é criptografado com **AES-256-GCM**: confidencialidade e autenticação da cópia, nonce aleatório por arquivo. SHA-256 adicional detecta alteração durante cópia de arquivos. O formato custom do `pg_dump` é validado com `pg_restore --list`; antes de promover `.partial` para cópia concluída, a autenticação GCM e a abertura do tar são verificadas.

Permissões: volume/estado privados `700`, arquivos `600`, chave `/etc/ritmo-saude/backup.key` em `400`, acesso apenas de root. A chave não fica dentro do próprio backup nem no Git. Credenciais de PostgreSQL estão em `/etc/ritmo-saude/backup.env`, fora do ambiente do app e da linha de comando.

A conexão ao Supabase usa **sslmode=verify-full** com a CA pública do Supabase montada somente leitura no cliente. Não foi usado fallback que desabilita a verificação. Certificado instalado em `/etc/ritmo-saude/supabase-ca.crt`; fingerprint SHA-256 observada: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`. Referência: [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

O cliente usa `postgres:18-alpine`; a imagem foi obtida antes do agendamento. Rotina de dump com limite de 128 MiB e 0,5 CPU. O restore de teste usa PostgreSQL temporário com rede desabilitada, sem porta publicada, 256 MiB e filesystem de dados em tmpfs. O container é removido ao concluir. O backup não altera registros em produção.

Não inclui binários do Supabase Storage, configurações da plataforma, histórico WAL/PITR nem um clone completo do serviço Supabase. O app atual persiste seus dados no PostgreSQL; se forem acrescentados uploads/Storage, será preciso estender a cópia. Um restore em outro projeto Supabase exige revisar grants, papéis e configuração gerenciada desse projeto. O teste isolado usou `--no-owner --no-acl`, com papéis e extensões de ambiente preparados, e não comprova sozinho uma migração integral da plataforma.

## Recuperação e validação

Executados: dump real, criptografia, validação de archive/checksum, decriptação autenticada e **restore completo dos schemas selecionados** em PostgreSQL isolado. Confirmados nove health tables, RLS em todas elas e usuários de autenticação restaurados. Nenhum dado de produção foi modificado pelo restore. Também testados round-trip GCM, rejeição de arquivo adulterado e rejeição de arquivo truncado.

Comandos na VM, como root:

```sh
systemctl list-timers ritmo-saude-backup.timer
systemctl show ritmo-saude-backup.service -p Result -p ExecMainStatus
journalctl -u ritmo-saude-backup.service --since today
cat /var/lib/ritmo-saude-backup/status.json
cat /var/lib/ritmo-saude-backup/restore-test.json
docker volume inspect ritmo-saude-backups

# Gerar uma cópia adicional agora pelo mesmo serviço agendado
systemctl start ritmo-saude-backup.service

# Testar o archive mais recente em banco descartável; não restaura produção
/usr/local/sbin/ritmo-saude-backup --restore-test
```

Não imprimir arquivos env ou chave. Diagnóstico bruto de falha fica restrito a root em `/var/lib/ritmo-saude-backup/last-error.log`; journal/status usam resultado sanitizado. O arquivo bruto é removido após novo backup bem-sucedido.

Para recuperação real, primeiro preservar o original e testar uma cópia em ambiente isolado. A descriptografia precisa da chave original; perder a chave torna os arquivos ilegíveis. `prepare-backup.py` recusa criar outra chave se já houver cópias criptografadas sem a chave original. Manter uma cópia da chave em cofre externo protegido é responsabilidade operacional; ela não foi enviada a serviços ou mensagens.

As cópias neste volume ficam na **mesma VM**. Elas cobrem perda lógica/remoção de dados no banco, dentro do ponto diário recuperável, mas não a perda simultânea do disco/VM e da chave. Por isso complementam a cópia oficial externa. A retenção de 30 dias foi configurada; ainda não decorreram 30 noites de execução.

## Central de Controle

O coletor existente já descobre todos os containers Docker; nenhuma allowlist precisa ser alterada. Foi confirmado `ritmo-saude` no snapshot coletado a cada **15 segundos**, como `running/healthy`, com limite de **384 MiB**, sem OOM e sem reinícios no retrato observado. A UI consome essa lista. Não foi necessário reconstruir ou reiniciar a Central.

Evidência: `docs/pilot-results/central-monitoring.json`. O endpoint health da Central retornou 200, e overview/monitor sem login retornaram 401. O overview autenticado da Central não foi exercitado; sua ligação à coleta/UI foi confirmada por código e snapshot.

**Notificações externas estão desabilitadas na configuração preexistente da Central.** O estado persistido do monitor de notificações estava antigo; não confundir coleta/painel com entrega de alertas. Não foram habilitadas notificações nem enviados avisos a terceiros. O worker compartilhado de mensageria apareceu parado e não foi reiniciado, pois fica fora desta alteração e pode requerer pareamento.

A coleta na própria VM não é uma sonda externa de disponibilidade: uma queda total da VM/rede não pode ser detectada por ela mesma. O status do backup é consultável por systemd e pelo JSON privado indicado; não foi criado widget nem notificação de backup na Central.

## Fontes e código

Arquivos versionados em `ops/backup/`; nenhum segredo ou dump foi versionado. Referências: [pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) e [backups do Supabase](https://supabase.com/docs/guides/platform/backups).
