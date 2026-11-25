# Ritmo Saúde

App separado do Super App financeiro para dieta e hidratação.

## Produção

- URL: https://controle-de-saude.duckdns.org
- VM: container Docker `ritmo-saude` em `/opt/ritmo-saude` (porta local `127.0.0.1:5199`)
- Nginx + Let’s Encrypt no domínio DuckDNS
- Dados: projeto Supabase dedicado (Auth + Postgres + RLS)
- Secrets: `/opt/ritmo-saude/.env` (chmod 600), montado via `env_file` — não vai na imagem

Cada push para `main` aciona `.github/workflows/deploy.yml` em um GitHub Actions
self-hosted runner instalado na própria VPS e rotulado `ritmo-saude-prod`. O runner
precisa escrever em `/opt/ritmo-saude` e executar Docker Compose. Registre o runner
na VM em **Settings → Actions → Runners → New self-hosted runner**, usando Linux
x64 e o rótulo adicional `ritmo-saude-prod`; use um usuário de serviço dedicado e
instale o runner como serviço.
O workflow compila o app/PWA, preserva o `.env` existente e executa
`docker compose up -d --build --force-recreate --remove-orphans`. As credenciais do
Supabase permanecem somente em `/opt/ritmo-saude/.env`; não são enviadas ao GitHub.

Admin seed SQL: crie primeiro sua conta em Supabase Dashboard → Authentication → Users,
com seu e-mail e uma senha forte. Antes de executar, substitua `EMAIL_DO_ADMIN_AQUI`
e `NOME_DO_ADMIN_AQUI` em `supabase/seed/admin.sql` pelos seus dados. Depois cole
o arquivo no SQL Editor do projeto e execute. O SQL vincula essa
conta Auth ao perfil `admin` e não altera a senha. Exige as migrations aplicadas.
Cadastre as outras contas pelo módulo Administração. A senha temporária inicial
é `123456`; o usuário deverá substituí-la por uma senha pessoal de pelo menos
8 caracteres no primeiro acesso. O admin criado pelo seed mantém a senha
definida no Supabase. Também existe o comando `npm run seed:admin`.

## Local

```powershell
npm install
npm run dev:mock
```

`dev:mock` força dados em memória (inclui avaliações corporais de demonstração). Com `npm run dev` e `.env` Supabase preenchido, a API local usa Postgres.

Acesse http://localhost:5199 com:

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Professor | `professor@saude.local` | `Demo@1234` |
| Aluno (André) | `aluno@saude.local` | `Demo@1234` |
| Admin | `master@saude.local` | `Demo@1234` |

Outros alunos mock: `ana@saude.local`, `bruno@saude.local`, `carla@saude.local`, `diego@saude.local` (mesma senha).

```powershell
npm run build
docker compose up -d --build
```

## Estrutura

- `api/` — auth e saúde (Express)
- `features/auth/` — login + adaptadores mock/Supabase
- `features/saude/` — UI e store (mock ou Supabase)
- `lib/supabase.js` — clientes admin/anon (só servidor)
- `supabase/migrations/` + `supabase/seed/` — schema RLS e alimentos
- `Dockerfile` / `docker-compose.yml` — deploy produção
