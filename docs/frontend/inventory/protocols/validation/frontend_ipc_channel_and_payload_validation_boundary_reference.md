---
summary: "Frontend validation boundary reference for protocol surfaces: preload IPC allowlists, typed bridge runtime checks, backend payload normalization, user-id sanitization, query XML escaping, and SDK local-runtime parameter shaping."
read_when:
  - When changing `preload.js`, renderer `IpcBridge`, or main-process websocket payload assembly.
  - When modifying SDK local-runtime payload shaping or query content enrichment input sanitation.
title: "Frontend IPC Channel and Payload Validation Boundary Reference"
---

# Frontend IPC Channel and Payload Validation Boundary Reference

## Coverage Snapshot (2026-02-27)

- Renderer `send` channels: `5`
- Renderer `invoke` channels: `33`
- Renderer `on/once` channels: `11`
- Compiled local-runtime mapper definitions: `0` (direct chat/memory IPC mapper removed)

## Scope and Sources

Validation boundary sources:

- Preload IPC allowlists: `frontend/src/preload.js`
- Renderer typed channel/bridge checks: `frontend/src/renderer/infrastructure/ipc/channels.ts`, `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- Main bridge payload normalization and user-id generation: `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_settings_sync.cjs`
- SDK query content escaping and fallback handling: `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`
- SDK local-runtime store/client code owns chat and memory RPC parameter shaping.

## Channel Validation Layers

## Layer 1: Preload hard allowlist (security boundary)

`window.ipc` only allows explicitly listed channels.

Contract behavior:

- `invoke`: invalid channel -> rejected promise with `Invalid invoke channel: <name>`.
- `send`/`on`/`once`: invalid channel ignored (no forward/subscription).

Role:

- enforce sandbox-safe IPC surface independent of renderer code quality.

High-sensitivity allowlisted channels currently include:

- invoke:
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`
- on/once:
  - `wakeword-stt-trigger`
  - `response-overlay-phase`
  - `response-overlay-visibility`

## Layer 2: Renderer typed constants + bridge checks

`channels.ts` exposes literal channel constants and types (`SendChannel`, `InvokeChannel`, `OnChannel`).

`IpcBridge.validateChannel(...)` behavior:

- dev mode (`NODE_ENV=development`): throws on unknown channel.
- production: skips check (preload remains source-of-truth security guard).

Role:

- fail fast during development on channel drift/typos.

## Outbound Backend Payload Normalization

Outbound backend payload filters:

- SDK managed agent sessions default to
  `packages/windie-sdk-js/src/transport/backendPayloadContract.ts`
  `filterBackendPayload(...)`.
- Electron main direct payloads use
  the SDK-owned `filterBackendPayload(...)` directly.
- Query payloads are shaped before send by `ipc_query_runtime.cjs`.

Reason:

- keep outbound websocket payload aligned with backend-supported schema keys.
- keep first-query settings ACK gate strict by requiring `settings-updated` or timeout before dispatch.

## User ID Validation/Sanitization Boundary

Electron main resolves install auth state before starting the SDK runtime:

- `ipc_install_auth_state.cjs` validates persisted install identity shape.
- `AgentClient.wakeUp(...)` builds the authenticated SDK handshake from the
  resolved install auth user id.

Role:

- keep backend handshakes on authenticated install identity instead of a
  synthetic OS-username fallback.

## Query Content Input Sanitization Boundary

`ContextEnrichmentPipeline.ts` input protection:

- `escapeXml(...)` escapes `& < > " '`, applied to user query, memory, and attachment text inserted into XML-style blocks.
- memory lookup failures degrade to deterministic empty memory sections.
- if full build fails, catch-all fallback still emits escaped user query.

Role:

- prevent malformed XML-like prompt context assembly from raw strings.

## SDK Local-Runtime Validation Boundary

Direct chat and memory IPC mapper fallbacks have been removed. Current
validation belongs at the SDK command/facade boundary and in SDK local-runtime
store calls that build local-runtime JSON-RPC params.

Examples:

- conversation and memory command payloads stay SDK-shaped at the renderer
  boundary.
- SDK local-runtime store code normalizes fields such as `conversationId`,
  `memoryId`, and `recordKind` into local-runtime Python snake_case params.
- local-runtime Python handler signatures provide the final JSON-RPC `INVALID_PARAMS`
  validation for missing or unexpected params.

Role:

- stabilize cross-layer naming differences without reviving direct
  sidecar-named renderer IPC channels.

## Validation Drift Risks

High-risk drift points to monitor:

- preload allowlist vs `channels.ts` constant mismatch.
- `IpcBridge` dev-time validation drift masking production no-op behavior.
- outbound normalization rules diverging from backend schema updates.
- user-id sanitization assumptions diverging from backend validation rules.
- SDK local-runtime store source keys drifting from canonical command payload shapes.

## Validation Control-Path Index

| Validation control path | Runtime owner | Safety contract |
|---|---|---|
| preload channel allowlist gate | `frontend/src/preload.js` | unallowlisted channels never cross renderer->main boundary |
| renderer development-time channel assertions | `frontend/src/renderer/infrastructure/ipc/bridge.ts` | fail-fast on typos/drift in dev while production defers to preload policy |
| outbound websocket payload normalization | `packages/windie-sdk-js/src/transport/backendPayloadContract.ts`, `frontend/src/main/ipc/ipc_query_runtime.cjs` | filters known backend command payloads through the SDK-owned contract allowlist before backend schema enforcement; main imports the SDK contract directly for direct payloads |
| handshake user-id identity | `frontend/src/main/ipc/ipc_install_auth_state.cjs` + `AgentClient.wakeUp(...)` | sends authenticated install identity instead of synthetic OS username fallback |
| query XML/context sanitization fallback | `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts` | escapes XML-sensitive content and guarantees structured fallback blocks |
| SDK local-runtime transforms | SDK local-runtime store/client code | canonical command-to-sidecar field mapping |

## Recompute Validation Surface Commands

Use these commands to refresh validation-surface counts:

- IPC channel counts from renderer constants:
  - `python - <<'PY'`
  - `import re, pathlib`
  - `text=pathlib.Path('frontend/src/renderer/infrastructure/ipc/channels.ts').read_text()`
  - `for name in ['SEND_CHANNELS','INVOKE_CHANNELS','ON_CHANNELS']:`
  - `    block=re.search(rf'{name}\\s*=\\s*\\{{(.*?)\\}}\\s*as const;', text, re.S).group(1)`
  - `    print(name, len([line for line in block.splitlines() if ':' in line]))`
  - `PY`
- JSON-RPC mapper definition count:
  - direct compiled mapper definitions are intentionally `0`; verify
    `frontend/src/main/sidecar/local_runtime_rpc_mappers.cjs` does not exist.

## Related Deep Dives

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
