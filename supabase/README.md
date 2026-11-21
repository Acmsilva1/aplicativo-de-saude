# Supabase (Ritmo Saúde)

Projeto dedicado — **não** reutilizar o Supabase do Super App.

## Migrations (ordem)

| Arquivo | Conteúdo |
|---|---|
| `migrations/20261120000000_initial_health_modules.sql` | Roles/profiles com `professor_id`, dietas, água, helpers RLS |
| `migrations/20261120000001_diet_templates.sql` | Portfólio de modelos do professor |
| `migrations/20261120000002_alimentos_catalog.sql` | Catálogo de alimentos + FK opcional |
| `seed/health_alimentos.sql` | Seed dos 121 alimentos (idempotente) |

## Padrão RLS (igual Super App)

- `enable` + `force row level security`
- `revoke` de `anon`
- helpers `security definer` (`health_is_admin`, `health_is_professor_of`, …)
- policies por operação (select/insert/update/delete)
- admin bypass; professor só alunos com `professor_id = auth.uid()`
- aluno registra água; professor/admin leem
- contas (`health_user_roles` / `health_user_profiles`) escritas via `service_role` no servidor

## Aplicar

Ainda **não** foram aplicadas. Rodar no SQL Editor do projeto `qfznkpobkzxauszozoyo` na ordem acima, ou via CLI apontando para esse projeto.

Provisionamento de usuários Auth + insert em roles/profiles fica no backend com `SUPABASE_SERVICE_ROLE_KEY`.
