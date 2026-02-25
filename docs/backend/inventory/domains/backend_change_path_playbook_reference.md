---
summary: "Backend change-path playbook mapping common feature/bug scenarios to exact modules and validation checks."
read_when:
  - When implementing backend features and needing a concrete file-by-file change path.
  - When fixing backend regressions and choosing minimal, correct module scope.
title: "Backend Change Path Playbook Reference"
---

# Backend Change Path Playbook Reference

Use this playbook for common backend change scenarios.

## Playbooks

### 1) Add new websocket message type

1. Add message literals in `backend/src/api/contracts/message_types.py`.
2. Add schema model in `backend/src/api/schemas/incoming.py` or `outgoing.py`.
3. Add handler class under `backend/src/api/handlers/`.
4. Register route mapping in `backend/src/core/container/incoming_routing.py` and registry wiring.
5. If streaming output: add formatter and spec in `api/processing/formatters/*` + `api/contracts/formatter_specs.py`.

Validation:

- Message schema parse tests.
- Handler registry route coverage.
- Outgoing schema contract tests.

### 2) Modify tool-call payload shape

1. Update backend tool arg schema source (`backend/src/tools/**/schemas.py` or browser args schema files).
2. Update `backend/src/tools/schema_registry.py` if declaration normalization changes.
3. Update tool-call formatter (`api/processing/formatters/tool_call.py`) if stream payload fields change.
4. Update incoming tool-result schemas if correlation/id semantics changed.
5. Sync sidecar schema and renderer tool payload handling.

Validation:

- Tool schema exposure tests.
- Tool-call/tool-output formatter tests.
- Frontend tool runner integration tests.

### 3) Change query stream lifecycle behavior

1. Start in `backend/src/api/services/query_execution.py`.
2. Update stream pipeline behavior in `backend/src/api/processing/pipeline.py`.
3. If completion behavior changes, align formatter + schema (`complete.py`, outgoing schemas).
4. If affects agent loop semantics, adjust `agent/execution/interaction_loop.py`.

Validation:

- Query handler service tests.
- Stream completion fallback tests.
- UI-facing event ordering tests.

### 4) Add new LLM provider behavior

1. Implement provider logic in `backend/src/llm/providers/<provider>.py`.
2. Wire provider factory in `backend/src/llm/providers/__init__.py`.
3. Align request kwargs behavior in `backend/src/llm/request_kwargs.py` if needed.
4. Confirm parser/stream expectations in `llm/parser*.py` and `agent/llm/llm_stream_processor.py`.

Validation:

- Provider unit tests (non-stream + stream + tool-call cases).
- Token usage/cached token diagnostics checks.

### 5) Fix tool result wait/race bug

1. Inspect `agent/tools/waiting/storage/result_storage.py`.
2. Inspect waiting receiver/router for id mapping and storage set paths.
3. Inspect `tools/single_tool_execution.py` / `bundle_execution.py` wait semantics.
4. Verify cleanup path in tool result processor and session lifecycle.

Validation:

- Result storage future lifecycle tests.
- Wait timeout and cancellation tests.
- Bundle result path tests.

### 6) Update memory embedding/summarization contract

1. Update routes under `api/routes/memory/`.
2. Update semantic parser/service behavior.
3. Ensure sidecar remote client expectations still match.
4. Update API docs and contract refs.

Validation:

- Memory route tests.
- Sidecar remote client integration tests.

## Scope Guards

- Do not patch formatter output to compensate for schema drift; fix schema/contract owner first.
- Do not patch API handlers for sidecar tool runtime issues; fix tool waiting/processing owner modules.
- Do not patch agent loop for provider parse edge cases before checking parser/provider layer.

## Related Docs

- [Backend Inventory Domains Hub](README.md)
- [Backend Domain Ownership Matrix Reference](backend_domain_ownership_matrix_reference.md)
- [Backend Cross-Layer Contract Touchpoints Reference](../backend_cross_layer_contract_touchpoints_reference.md)
