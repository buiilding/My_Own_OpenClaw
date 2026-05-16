---
summary: "Diagnostics guide for isolating WindieOS failures across backend, Electron main, renderer, sidecar, providers, and tools."
read_when:
  - When triaging failures before changing code.
  - When deciding which logs, commands, or docs to inspect first.
title: "Diagnostics"
---

# Diagnostics

WindieOS failures are easiest to debug by locating the runtime boundary first.

## Boundary Checklist

| Symptom | First place to inspect |
| --- | --- |
| No backend response | `frontend/src/main/ipc.cjs`, backend websocket logs, `backend/src/api/routes/websocket/*` |
| Model list missing or stale | settings ACK path, `backend/src/llm/models/model_service.py`, `backend/src/llm/models/models_config.py` |
| Tool call appears but does not execute | SDK runtime tool router, main sidecar bridge, `frontend/src/main/python/tools/registry.py` |
| Tool result reaches frontend but model does not continue | backend tool-result ingestion/waiting/processing modules |
| Screenshot includes overlay | platform screenshot guard and overlay visibility docs |
| Browser action fails | backend browser schema first, then sidecar browser runtime |
| Memory/search/title issue | sidecar memory store, backend semantic/title routes, embedding provider health |
| Packaged app starts but tools fail | bundled Python runtime path, sidecar requirements, install auth, backend URL config |

## Useful Commands

```bash
./bin/docs-list
git status --short --branch
./scripts/test-backend
./scripts/test-sidecar
cd frontend && npm run test:ci
cd frontend && npm run lint
```

For trace flags, logging controls, symptom playbooks, and focused test selection, read [Debug](../debug/README.md).

For a report that is not yet tied to a subsystem, start with [Triage Routes](triage_routes.md), then use [Doctor Checklist](doctor_checklist.md) and [Evidence Packet](evidence_packet.md) to collect only the evidence the owner runtime needs.

## Diagnostic Rule

Do not patch the first failing UI symptom until you know whether the producer contract is valid. Many WindieOS bugs are contract drift across backend formatter/schema, Electron bridge mapping, renderer guards, and sidecar executable tools.
