---
summary: "Security Notes (Current)"
read_when:
  - When changing security-relevant code.
---

# Security Notes (Current)

This document describes **current** security-related behavior in the codebase.

## IPC & Renderer Isolation

- Electron renderer runs with **contextIsolation** and **nodeIntegration disabled**.
- IPC channels are whitelisted in `frontend/src/preload.js` and `frontend/src/renderer/infrastructure/ipc/bridge.ts`.

## Backend Validation

- WebSocket messages are validated by Pydantic schemas in `backend/src/api/schemas/` (`common.py`, `incoming.py`, `outgoing.py`).
- LLM response parsing uses size limits from `SecurityLimits` (`backend/src/core/config/models.py`).
- Multi-user/session hardening guidance is documented in `docs/operations/multi_user_runtime_hardening.md`.
- Hosted install-token REST and websocket identity behavior is documented in `docs/operations/hosted_backend_auth.md`.

## Tool Execution

- Local-runtime tool execution uses the Python implementation under
  `frontend/src/main/python/tools`.
- Backend provides a `SecurityPolicy` model (`backend/src/core/security/policy.py`) with permissions, resource limits, and audit log entries. Review before enabling stricter enforcement.

## Secrets

- API keys are read from environment variables (see `backend/src/core/config/models.py`).
- Runtime environment ownership and propagation rules are documented in `docs/operations/runtime_configuration_matrix.md`.

## Hosted Mode (Planned)

See `docs/planning/README.md` for future hosted security and compliance plans.
