# Checkpoint — correção e aprimoramento Ritmo Saúde

Controle de fases. **Não avançar sem autorização explícita** após testes da fase atual.

| Fase | Status | Autorização |
|------|--------|-------------|
| 0 — Bugs bloqueantes | **Concluída + testada** | — |
| 1 — SQL aditivo | **Concluída + testada** | Migrations aplicadas |
| 2 — Store/API | **Concluída + testada** | Autorizada |
| 3 — RPCs compostas | **Concluída + testada** | Autorizada |
| 4 — Front (debounce, trim, cache) | **Concluída + testada** | Autorizada |
| 5 — Auth residual | **Concluída + testada** | Autorizada |

**Todas as fases do plano foram concluídas.**

---

## Fase 5 — Auth residual

**Status:** concluída  
**Data:** 2026-11-23

### O que foi feito

1. **Revogação global de sessões** ([`supabaseAuthService.js`](features/auth/service/supabaseAuthService.js))  
   - `revokeAllSessionsForUser`: magiclink temporário + `signOut(..., 'global')`  
   - Chamado ao **pausar** conta (`access=false`)  
   - Chamado ao **reenviar link de senha**  
   - Chamado antes de `deleteUser`  
   - Best-effort (falha não bloqueia a operação administrativa)

2. **WebAuthn no delete**  
   - `health_webauthn_credentials` no cleanup de `deleteAccount`  
   - Também em `deleteUserData` do store  
   - Mock já limpava credenciais (mantido)

3. **Piloto alinhado à regra de produto**  
   - [`scripts/pilot-crud-audit.mjs`](scripts/pilot-crud-audit.mjs): exclusão de professor com alunos → **200 + unlink** (não mais 400)  
   - Coerente com `check-security` e mensagem da UI de contas

### Testes executados (PASS)

```text
node scripts/check-phase5.mjs
node scripts/check-security.mjs
node scripts/check-phase0.mjs
node scripts/check-webauthn-mock.mjs
node scripts/check-phase4.mjs
node scripts/check-phase3.mjs
```

---

## Pendências operacionais (Supabase)

Aplicar se ainda não aplicado:

1. `20261123180000_trial_in_health_has_access.sql`  
2. `20261123190000_perf_indexes_auth_uid_cache.sql`  
3. `20261123200000_health_hotpath_rpcs.sql`

## Próximos passos sugeridos (fora do plano)

- Smoke manual (login aluno/professor, água, dieta, pausar conta)  
- Reexecutar `pilot-crud-audit.mjs` / runtime audit no ambiente real  
- Distribuir test-users
