---
summary: "Agent-facing runtime ownership matrix and change-routing table extracted from AGENTS.md."
read_when:
  - When starting a WindieOS code or docs change and choosing the owning runtime before editing.
  - When routing runtime ownership cleanup, ownership refactors, source-of-truth moves, or cross-runtime deletion work.
  - When a change could cross backend, SDK, Electron main, renderer, preload, local-runtime implementation, docs, or tests.
title: "Agent Runtime Ownership and Change Routing"
---

# Agent Runtime Ownership and Change Routing

This page is the detailed ownership and routing companion for `AGENTS.md`.
Start every change by identifying the owning runtime before editing code.

## Runtime Ownership

| Runtime | Owns | Must not own |
| --- | --- | --- |
| Backend | Prompt construction, provider routing, hosted APIs, OCR/vision services, artifacts, compaction decisions, backend remote tools, final model-facing tool-schema projection | Local mouse, keyboard, browser, filesystem, shell, OS permissions, or desktop window behavior |
| SDK runtime | Hosted backend websocket lifecycle, install-token identity resolution, local runtime startup/reuse, local-tool result return, normalized conversation events, conversation stores, replay/rehydrate helpers, projections reusable by Electron, CLI, plugins, and tests | Electron-only shell policy or local-runtime Python tool implementation details |
| Electron main | BrowserWindow lifecycle, IPC transport, menus, app lifecycle, native permissions, platform window policy, desktop local-runtime launch option assembly, wakeword supervision, endpoint diagnostics, direct `AgentClient.wakeUp(...)` customer wiring | Agent loop, prompt compiler, durable conversation store, websocket lifecycle, local-tool routing authority, local-runtime daemon client/lifecycle ownership, or duplicate SDK runtime behavior |
| Renderer | User-facing state and display, dashboard/chat/settings/voice surfaces, transcript projection display, display-only tool state | Backend websocket loops, durable transcript storage, tool execution, model sync, or local authority |
| Preload | Narrow allowlisted bridge between renderer and main | Business logic or policy decisions |
| local-runtime implementation | Local machine authority, local tools, local memory/storage, browser mechanics, filesystem/shell/process/system execution, currently backed by local-runtime Python | Backend orchestration, prompt policy, provider routing, or backend package imports |
| Docs and tests | Durable contracts, routing maps, parity checks, and regression evidence | Runtime behavior |

## Change Routing

| Change type | Start with | Required follow-through |
| --- | --- | --- |
| Backend API route | `docs/backend/api/api_route_change_workflow.md` | Route schema, service code, tests, docs, changelog |
| SDK route or client method | `docs/sdk/sdk_route_change_workflow.md` | Backend route models, TS/Python clients, examples or tests, docs, changelog |
| Model-visible tool | `docs/tools/tool_schema_policy_change_workflow.md` | Backend catalog/policy, local-runtime executable contract if local, SDK/main dispatch, tests, docs, changelog |
| Filesystem or shell behavior | `docs/tools/filesystem_shell_change_workflow.md` | Backend schema/policy, SDK/main dispatch, Electron argument shaping, local execution, result formatting, tests |
| Browser automation | `docs/browser/browser_change_workflow.md` | Backend schema, shared browser contract, local-runtime browser execution, local-runtime Python adapters, Electron bridge, renderer controls, tests |
| Renderer/main/local-runtime ownership bug | `docs/architecture/frontend_architecture.md` and `docs/architecture/runtime_boundary_matrix.md` | Identify the producer before editing the consumer |
| Storage or transcript behavior | `docs/architecture/storage_persistence_change_workflow.md` | State migration or no-migration reason explicitly |
| Permission or local authority | `docs/security/permissions_and_local_authority_workflow.md` | Verify trust boundary and platform behavior |
| Overlay/chat pill/runtime surface bug | `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` and `docs/desktop/minimal_chat_pill.md` | Define the state machine and event timeline before editing |
| Release or packaging | `docs/operations/release_packaging_change_workflow.md`, `RELEASING.md`, or `release.md` if present | Run relevant tests first; do not change versions or publish without approval |
