# Changelog

## [0.1.0] — 2026-10-28 — Fase 1

### Adicionado
- Estrutura do monorepo (`backend/`, `frontend/`, `docs/`), Docker Compose e CI no GitHub Actions.
- Modelo de dados completo (36 tabelas) com migração inicial e migração de restrições: conflito de agenda (`EXCLUDE`), CHECKs monetários, comissão única por item, uma configuração visual publicada.
- Autenticação com Argon2id, sessão em cookie HttpOnly, CSRF, bloqueio por tentativas, rate limit, Helmet e CORS restrito.
- Permissões por função e escopo por unidade aplicados no backend.
- Gestão de usuários da equipe e trilha de auditoria.
- Frontend: login, painel com menu por permissão, usuários e troca de senha.
- 65 testes automatizados (62 backend, 3 frontend).
