---
summary: "Renderer and Electron main desktop backend transport command contract for DesktopBackendTransport, SDK_RUNTIME_COMMANDS, windie:invoke conversation commands, canonical snake_case query payload fields, and removed camelCase query-payload aliases."
read_when:
  - When changing `frontend/src/renderer/app/runtime/desktopBackendTransport.ts`, `DesktopLiveTurnRuntimeClient`, or renderer-to-main `windie:invoke` command payloads.
  - When changing `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`, the SDK `SDK_RUNTIME_COMMANDS` export, renderer runtime facades that call `invokeAgentSdkCommand`, Electron main `handleAgentSdkInvoke`, its internal `buildAgentSdkCommandHandlers` table, or shared SDK-shaped command names.
  - When resolving stale references to the removed renderer `windieCommandInvokeClient.ts` file or `invokeWindieCommand(...)` helper; the current generic renderer helper is `agentSdkCommandInvokeClient.ts` and `invokeAgentSdkCommand(...)`.
  - When resolving stale references to the removed `handleWindieSdkInvoke` or `buildWindieSdkCommandHandlers` helper names; the current generic Electron-host helper names are `handleAgentSdkInvoke` and `buildAgentSdkCommandHandlers`.
  - When searching for main ipc buildWindieSdkCommandHandlers SDK_RUNTIME_COMMANDS conversation.send command-shape routing; this transport contract is the current owner.
  - When debugging camelCase query payload aliases, snake_case command contract fields, `conversation.send`, `conversation.stop`, `conversations.list`, `memories.list`, `diagnostics.append`, or typed SDK dispatch between renderer facades and Electron main.
title: "Desktop Backend Transport Command Contract Reference"
---

# Desktop Backend Transport Command Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopBackendTransport.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient.ts`
- `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `tests/frontend/DesktopBackendTransport.test.ts`
- `tests/frontend/DesktopLiveTurnRuntimeClient.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`

## Boundary

`desktopBackendTransport.ts` is the renderer-side adapter from SDK-style
conversation runtime calls into the main-process `windie:invoke` command
surface.

Renderer runtime facades and Electron main import command names from the SDK
package `SDK_RUNTIME_COMMANDS` export. The SDK package owns the string
constants so first-party renderer facades, main-process handler keys, and
non-renderer SDK customers use one command vocabulary instead of duplicating
literals in each facade or IPC handler map.

`desktopBackendTransport.ts` calls:

- `conversation.send`
- `conversation.stop`
- `conversation.rehydrate`
- `conversation.compact`
- `wakeword.detected`
- `settings.update`
- `models.list`

Other desktop renderer facades use the same SDK export for conversation
library, transcript, memory, and diagnostics commands such as
`conversations.list`, `conversation.loadDisplay`, `memories.list`,
`memories.delete`, `conversations.clearAll`, and `diagnostics.append`.

Electron main exports `handleAgentSdkInvoke(...)` as the `windie:invoke`
boundary. Its internal command table uses those same `SDK_RUNTIME_COMMANDS`
members as computed handler keys. The string values remain the wire contract on
`windie:invoke`, but the helper itself takes generic Electron-host dependencies
such as `ensureAgent`; the source of truth for adding or renaming a supported
SDK-shaped command is
`packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`.

The previous renderer helper file `windieCommandInvokeClient.ts` and function
`invokeWindieCommand(...)` were renamed to
`agentSdkCommandInvokeClient.ts` and `invokeAgentSdkCommand(...)`. The preload
bridge and IPC channel still use `window.windie` / `windie:invoke` as the
existing wire contract; only the renderer helper name changed.

The previous internal helper names `handleWindieSdkInvoke(...)` and
`buildWindieSdkCommandHandlers(...)` were removed from the Electron main
boundary. Stale searches for those names should route here and update callers to
the generic `handleAgentSdkInvoke(...)` and `buildAgentSdkCommandHandlers(...)`
names.

It does not talk to the backend websocket directly and does not execute tools.
Electron main remains responsible for settings gates, query enrichment,
websocket send, replay buffers, synthetic send-failure events, and local tool
execution routing.

## Query Payload Shape

`conversation.send` payloads sent from the renderer transport to main use the
canonical snake_case command contract:

- `conversation_ref`
- `query_message_id`
- `screenshot_ref`
- `screenshot`
- `screenshot_url`
- `screenshot_refs`
- `capture_meta`
- `attachment_context`
- `attachment_filenames`
- `workspace_path`
- `memory_retrieval_enabled`

The transport no longer maps removed camelCase aliases such as
`conversationRef`, `screenshotRef`, `screenshotUrl`, `screenshotRefs`,
`attachmentContext`, `attachmentFilenames`, `workspacePath`, or `turnRef`.

If a caller passes camelCase aliases into `desktopBackendTransport`, those
fields are ignored. Fix the caller to send the canonical snake_case runtime
shape instead of reintroducing alias fallback in the transport.

## Command Return and Error Contract

`sendQuery(...)`:

1. invokes `windie:invoke` with `conversation.send`
2. throws when main returns `{ ok: false, error }`
3. returns the accepted `messageId` from main when provided
4. otherwise returns the caller-provided message id

`compactHistory(...)`, `wakewordDetected(...)`, and `updateSettings(...)` return
the snake_case `turn_ref` when present. Removed `turnRef` aliases are not read.

`stop(...)` sends only `conversation_ref` and `turn_ref` to
`conversation.stop`; camelCase stop aliases are ignored.

## Drift Hotspots

1. Re-adding camelCase fallback in `desktopBackendTransport` keeps duplicate
   renderer command authorities alive and hides callers that failed to normalize
   at the SDK/runtime boundary.
2. Moving query enrichment into this adapter duplicates Electron main ownership.
3. Treating `DesktopBackendTransport` as a websocket client bypasses main-owned
   settings gates, overlay phase, replay buffers, and failure synthesis.
4. Letting `workspacePath` override `workspace_path` can send queries with stale
   workspace context after the active workspace binding has changed.

## Related Pages

- [Renderer Runtime](renderer_runtime.md)
- [Query Send and Stream Relay Change Workflow](../main/query_send_and_stream_relay_change_workflow.md)
- [Query Payload and Relay Reference](../main/query_payload_and_relay_reference.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
- [Session and Transcript Reference](../../reference/session_and_transcript_reference.md)
