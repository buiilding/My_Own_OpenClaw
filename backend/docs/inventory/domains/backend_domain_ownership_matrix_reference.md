---
summary: "Backend domain ownership matrix mapping responsibilities to primary modules and secondary integration modules."
read_when:
  - When assigning ownership for backend architecture changes.
  - When splitting backend work across API/agent/core/tools/llm/services domains.
title: "Backend Domain Ownership Matrix Reference"
---

# Backend Domain Ownership Matrix Reference

## Ownership Matrix

| Domain | Primary ownership modules | Secondary integration modules | Non-owners (avoid primary edits) |
| --- | --- | --- | --- |
| API transport + handlers | `backend/src/api/routes/**`, `backend/src/api/handlers/**`, `backend/src/api/infrastructure/**`, `backend/src/api/transport/**` | `backend/src/api/services/**`, `backend/src/api/processing/**` | `agent/**`, `tools/**` |
| Agent loop + session runtime | `backend/src/agent/session/**`, `backend/src/agent/execution/**`, `backend/src/agent/llm/**` | `backend/src/agent/history/**`, `backend/src/agent/tools/**` | `api/routes/**` |
| Tool lifecycle (prepare/send/wait/process) | `backend/src/agent/tools/**`, `backend/src/tools/orchestrator.py`, `backend/src/tools/{single_tool_execution,bundle_execution}.py` | `backend/src/tools/registry.py`, `backend/src/tools/remote_tools/**` | `api/schemas/**` as first stop |
| Core DI/config/bootstrap | `backend/src/core/container/**`, `backend/src/core/config/**`, `backend/src/core/bootstrap/**` | `backend/src/api/deps.py`, `backend/src/main.py` | `agent/**` direct constructor edits |
| LLM providers + parser + prompts | `backend/src/llm/providers/**`, `backend/src/llm/parser*.py`, `backend/src/llm/prompts/**`, `backend/src/llm/client.py` | `backend/src/agent/llm/**`, `backend/src/llm/models/**` | `api/processing/**` |
| Runtime services (ocr/vision/artifact/token) | `backend/src/services/**` | `backend/src/api/routes/{memory,artifacts}/**`, `agent/tools/preparation/**` | `api/handlers/**` first edit |
| Message/schema contracts | `backend/src/api/schemas/**`, `backend/src/api/contracts/**`, `backend/src/core/types/**`, `backend/src/core/events/**` | `backend/src/api/processing/formatters/**` | UI formatting docs only |
| Security/observability | `backend/src/core/security/**`, `backend/src/core/observability/**` | `backend/src/core/container/**`, `backend/src/llm/parser_validation.py` | `api/handlers/**` |
| Simulation + sdk | `backend/src/simulation/**`, `backend/src/sdk/**` | `backend/src/tools/templates/**` | production route/handler modules |

## Responsibility Boundaries

- `api/**` owns network ingress/egress shape, handler dispatch, stream formatting.
- `agent/**` owns turn loop semantics, session state, tool-turn sequencing.
- `tools/**` owns backend-visible tool schema/registry + wait orchestration helpers.
- `core/**` owns dependency graph, runtime config policy, shared infra.
- `llm/**` owns provider behavior, parsing contracts, prompt construction.
- `services/**` owns stateful model/IO services (OCR, vision, artifact, tokens).

## Red-Flag Ownership Violations

- Editing `api/handlers/*` to patch tool result structure instead of `agent/tools/waiting/*`.
- Editing `agent/execution/*` for provider-specific serialization (belongs in `llm/providers/*`).
- Editing `core/container/*` for one-off feature flags that belong in `core/config/*`.
- Editing frontend docs/contracts without updating `api/schemas/*` and formatters.

## Fast Triage Map

- WebSocket parse/close/validation issue: start `api/routes/websocket/*`.
- Missing stream event in UI: start `api/processing/formatters/*` + `api/schemas/outgoing.py`.
- Tool result stuck/wait timeout: start `agent/tools/waiting/storage/result_storage.py` + `tools/single_tool_execution.py`.
- Prompt/tool-call extraction mismatch: start `llm/parser*.py` + `agent/llm/llm_stream_processor.py`.
- OCR/coordinate mismatch: start `agent/tools/preparation/**` + `services/{ocr,vision}/**`.

## Related Docs

- [Backend Inventory Domains Hub](README.md)
- [Backend Change Path Playbook Reference](backend_change_path_playbook_reference.md)
- [Backend Runtime Flow Matrix Reference](../backend_runtime_flow_matrix_reference.md)
