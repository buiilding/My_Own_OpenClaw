---
summary: "Compact quick cards for routing common WindieOS changes to the correct owner docs, checks, and safety notes."
read_when:
  - When you need a short owner-first route for a common WindieOS change before reading deeper docs.
  - When a change touches more than one runtime and you want the first docs, validation, and no-go checks.
title: "Agent Routing Quick Cards"
---

# Agent Routing Quick Cards

Use these cards after `docs/docs.json`, [Docs Directory](../getting-started/docs_directory.md), and [Agent Runtime Ownership and Change Routing](agent_runtime_ownership_and_change_routing.md). Each card names the likely owner, the first docs to read, the minimum validation shape, and the mistake to avoid.

These cards do not replace the deeper workflow docs. They are a fast map for choosing where to start.

## Backend API Route

Owner: backend.

Start with [Backend API Hub](../backend/api/README.md), [API Route Change Workflow](../backend/api/api_route_change_workflow.md), and [HTTP and WebSocket API Surface](../reference/http_api_surface.md).

Validate route models, auth behavior, service tests, and any SDK/client examples that call the route. Keep route contracts in backend docs and do not make frontend or sidecar code import backend objects for parity.

Avoid: adding a renderer-side fallback for malformed route payloads before fixing the backend producer.

## SDK Route Or Client Method

Owner: SDK runtime with backend route parity.

Start with [SDK Hub](../sdk/README.md), [SDK Route Change Workflow](../sdk/sdk_route_change_workflow.md), and [SDK Auth and Error Handling](../sdk/sdk_auth_and_error_handling.md).

Validate backend route models, TypeScript/Python client behavior, error envelopes, and example or unit coverage. Keep reusable route behavior in the SDK instead of adding an Electron-only bridge.

Avoid: creating a second Electron path that renames and forwards SDK payloads without enforcing a real boundary.

## Model-Visible Tool Schema

Owner: backend schema and policy, with client-local manifest parity when the tool executes locally.

Start with [Tools Hub](../tools/README.md), [Tool Schema and Policy Change Workflow](../tools/tool_schema_policy_change_workflow.md), and [Tool Catalog Matrix](../tools/tool_catalog_matrix.md).

Validate model schema projection, provider policy, sidecar parity when executable fields change, and result-contract tests. Preserve the distinction between model-facing schema and prepared sidecar arguments.

Avoid: changing only the Python tool executor while leaving the model-visible schema or provider projection stale.

## Filesystem Or Shell Tool Behavior

Owner: Python sidecar execution with backend/client tool contract parity.

Start with [Filesystem and Shell Change Workflow](../tools/filesystem_shell_change_workflow.md), [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md), and [Permissions and Local Authority Workflow](../security/permissions_and_local_authority_workflow.md).

Validate schema visibility, working-directory handling, process/session behavior, sudo policy, output formatting, and sidecar tests. Keep local machine authority in the sidecar.

Avoid: moving filesystem or shell execution into backend code to make a local failure easier to reproduce.

## Browser Automation

Owner: sidecar browser runtime, shared browser contract, and renderer controls.

Start with [Browser Change Workflow](../browser/browser_change_workflow.md), [Browser Hub](../browser/README.md), and [Browser Tool](../tools/browser.md).

Validate browser action schemas, CDP/session startup, snapshot/ref behavior, downloaded files, Electron readiness controls, and focused browser tests. Keep dedicated browser state distinct from generic shell or computer-use behavior.

Avoid: treating browser failures as plain tool-dispatch failures before checking the browser runtime and session lifecycle.

## Overlay Or Chat Pill Runtime

Owner: Electron main window policy plus renderer display state.

Start with [Minimal Chat Pill](../desktop/minimal_chat_pill.md), [Response Overlay](../desktop/response_overlay.md), and [Overlay Phase and Surface Change Workflow](../frontend/runtime/overlay_phase_and_surface_change_workflow.md).

Validate phase transitions, focus handoff, visibility, click-through, screenshot hide/restore, and mode-specific tests. Define the event timeline before editing.

Avoid: mixing focus, visibility, transport, and click-through changes in one patch unless the state machine requires it.

## Screenshots Or Artifacts

Owner: sidecar capture for local screenshots, backend artifacts for hosted storage, and renderer replay/display for presentation.

Start with [Artifact Change Workflow](../desktop/artifact_change_workflow.md), [Artifacts and Attachments](../desktop/artifacts_and_attachments.md), and [Screenshot and Overlay Policy](../platforms/screenshot_overlay_policy.md).

Validate capture-time overlay hiding, artifact upload/fetch, screenshot refs in query payloads, post-action tool screenshot output, and replay rendering. Include a migration note when persisted artifact identifiers or storage paths change.

Avoid: fixing a missing image only in the renderer before checking whether the capture, upload, or replay producer dropped the reference.

## Transcript Or Replay Behavior

Owner: SDK/runtime stores and renderer projection, with sidecar transcript storage and backend rehydrate contracts where applicable.

Start with [Transcript Replay Change Workflow](../memory/transcript_replay_change_workflow.md), [Sessions and Conversations](../concepts/sessions_and_conversations.md), and [Session and Transcript Reference](../reference/session_and_transcript_reference.md).

Validate transcript writes, pending queue retries, dashboard replay, backend rehydrate payloads, stale-event filtering, and tool-row reconstruction. Keep visible transcript state distinct from raw event/history rows.

Avoid: patching dashboard replay output before finding the producer that persisted or omitted the row.
