---
summary: "Frontend validation boundary reference for protocol surfaces: preload IPC allowlists, typed bridge runtime checks, backend payload normalization, user-id sanitization, query XML escaping, and local-backend RPC mapping fallbacks."
read_when:
  - When changing `preload.js`, renderer `IpcBridge`, or main-process websocket payload assembly.
  - When modifying local-backend RPC payload mappers or query content enrichment input sanitation.
title: "Frontend IPC Channel and Payload Validation Boundary Reference"
---

# Frontend IPC Channel and Payload Validation Boundary Reference

## Scope and Sources

Validation boundary sources:

- Preload IPC allowlists: `frontend/src/preload.js`
- Renderer typed channel/bridge checks: `frontend/src/renderer/infrastructure/ipc/channels.ts`, `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- Main bridge payload normalization and user-id generation: `frontend/src/main/ipc.cjs`
- Query content escaping and fallback handling: `frontend/src/main/query_payload_builder.cjs`
- Local-backend RPC mapping utilities: `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`

## Channel Validation Layers

## Layer 1: Preload hard allowlist (security boundary)

`window.ipc` only allows explicitly listed channels.

Contract behavior:

- `invoke`: invalid channel -> rejected promise with `Invalid invoke channel: <name>`.
- `send`/`on`/`once`: invalid channel ignored (no forward/subscription).

Role:

- enforce sandbox-safe IPC surface independent of renderer code quality.

## Layer 2: Renderer typed constants + bridge checks

`channels.ts` exposes literal channel constants and types (`SendChannel`, `InvokeChannel`, `OnChannel`).

`IpcBridge.validateChannel(...)` behavior:

- dev mode (`NODE_ENV=development`): throws on unknown channel.
- production: skips check (preload remains source-of-truth security guard).

Role:

- fail fast during development on channel drift/typos.

## Outbound Backend Payload Normalization

`normalizeBackendPayload(type, payload)` in `ipc.cjs`:

- non-object payload -> `{}`.
- strips `screenshot_url` for:
  - `query`
  - `tool-bundle-result`

Reason:

- keep outbound websocket payload aligned with backend-supported schema keys.

## User ID Validation/Sanitization Boundary

`generateUserId()` in `ipc.cjs`:

- prefers OS username when available and not `default_user`.
- sanitizes username to `[a-zA-Z0-9_-]` (non-matching chars replaced with `_`).
- truncates to max `128` chars.
- fallback: `user_<uuid-with-underscores>`.

Role:

- proactively satisfy backend `validate_user_id` contract and reduce handshake rejects.

## Query Content Input Sanitization Boundary

`query_payload_builder.cjs` input protection:

- `escapeXml(...)` escapes `& < > " '`, applied to user query and system/memory text inserted into XML blocks.
- fallback system-context XML emitted on system-state fetch failures.
- if full build fails, catch-all fallback still emits escaped user query.

Role:

- prevent malformed XML-like prompt context assembly from raw strings.

## RPC Mapper Validation/Fallback Boundary

`local_backend_bridge_rpc_mappers.cjs` safeguards:

- non-object payload coerced to `{}` by `getPayloadObject(...)`.
- mapper supports:
  - direct source key mapping,
  - fallback key arrays (camelCase vs snake_case compatibility),
  - function-based field transforms.

Examples:

- `search-memory`: `excludeConversationId` fallback to `exclude_conversation_id`.
- `get-conversation`/`delete-conversation`: `conversationId` normalized to `conversation_id` with explicit `null` default.
- transcript mapper preserves optional metadata fields while normalizing key names.

Role:

- stabilize cross-layer naming differences without brittle per-call manual transforms.

## Validation Drift Risks

High-risk drift points to monitor:

- preload allowlist vs `channels.ts` constant mismatch.
- `IpcBridge` dev-time validation drift masking production no-op behavior.
- outbound normalization rules diverging from backend schema updates.
- user-id sanitization assumptions diverging from backend validation rules.
- mapper key fallback paths lost during refactors, breaking backward-compatible payload shapes.

## Related Deep Dives

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
