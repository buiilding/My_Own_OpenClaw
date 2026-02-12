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

- WebSocket messages are validated by Pydantic schemas (`backend/src/api/schema.py`).
- LLM response parsing uses size limits from `SecurityLimits` (`backend/src/core/config/models.py`).
- Multi-user/session hardening guidance is documented in `docs/MULTI_USER_RUNTIME_HARDENING.md`.

## Tool Execution

- Tool execution happens in the Python sidecar (`frontend/src/main/python/tools`).
- Backend provides a `SecurityPolicy` model (`backend/src/core/security/policy.py`) with permissions, resource limits, and audit log entries. Review before enabling stricter enforcement.

## Secrets

- API keys are read from environment variables (see `backend/src/core/config/models.py`).

## Hosted Mode (Planned)

See `docs/SECURITY_AND_COMPLIANCE.md` for future hosted security and compliance plans.
