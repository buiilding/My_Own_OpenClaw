---
summary: "Renderer and Electron main desktop runtime transport command contract for DesktopRuntimeTransport, SDK_RUNTIME_COMMANDS, windie:invoke conversation commands, canonical snake_case command contract fields, camelCase query payload alias rejection, and removed query-payload aliases."
read_when:
  - When changing `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`, `DesktopLiveTurnRuntimeClient`, or renderer-to-main `windie:invoke` command payloads.
  - When changing `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`, the SDK `SDK_RUNTIME_COMMANDS` export, renderer runtime facades that call `invokeAgentSdkCommand`, Electron main `handleAgentSdkInvoke`, its internal `buildAgentSdkCommandHandlers` table, or shared SDK-shaped command names.
  - When resolving stale references to the removed renderer `windieCommandInvokeClient.ts` file or `invokeWindieCommand(...)` helper; the current generic renderer helper is `agentSdkCommandInvokeClient.ts` and `invokeAgentSdkCommand(...)`.
  - When resolving stale references to the removed `handleWindieSdkInvoke` or `buildWindieSdkCommandHandlers` helper names; the current generic Electron-host helper names are `handleAgentSdkInvoke` and `buildAgentSdkCommandHandlers`.
  - When searching for main ipc buildWindieSdkCommandHandlers SDK_RUNTIME_COMMANDS conversation.send command-shape routing; this transport contract is the current owner.
  - When debugging removed camelCase query payload aliases, snake_case command contract fields, `conversation.send`, `conversation.stop`, `conversations.list`, `memories.list`, `diagnostics.append`, or typed SDK dispatch between renderer facades and Electron main.
title: "Desktop Runtime Transport Command Contract Reference"
---

# Desktop Runtime Transport Command Contract Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopRuntimeTransport.ts`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopLiveTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopLiveSurfaceTraceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/agentSdkCommandInvokeClient.ts`
- `packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `tests/frontend/DesktopRuntimeTransport.test.ts`
- `tests/frontend/DesktopLiveTurnRuntimeClient.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`

## Boundary

`desktopRuntimeTransport.ts` is the renderer-side adapter from SDK-style
conversation runtime calls into the main-process `windie:invoke` command
surface.

Renderer runtime facades and Electron main import command names from the SDK
package `SDK_RUNTIME_COMMANDS` export. The SDK package owns the string
constants so first-party renderer facades, main-process handler keys, and
non-renderer SDK callers use one command vocabulary instead of duplicating
literals in each facade or IPC handler map. There is no exported
`SdkRuntimeCommand` type alias; callers that need a command-name union should
derive it from `SDK_RUNTIME_COMMANDS` locally.

`desktopRuntimeTransport.ts` calls:

- `conversation.send`
- `conversation.stop`
- `conversation.rehydrate`
- `conversation.compact`
- `wakeword.detected`
- `settings.update`
- `models.list`

Other desktop renderer facades use the same SDK export for SDK library,
transcript, memory, and diagnostics commands such as
`conversations.list`, `conversation.loadDisplay`, `memories.list`,
`memories.delete`, `conversations.clearAll`, and `diagnostics.append`.
Those SDK-shaped library commands use canonical SDK object fields such as
`userId`, `conversationRef`, `messageId`, and `turnRef`; removed snake_case
input aliases such as `user_id`, `conversation_ref`, `message_id`, and
`turn_ref` are rejected at the Electron main validation boundary. Query
transport commands are separate and keep the backend transport payload contract
described below.

Electron main exports `handleAgentSdkInvoke(...)` as the `windie:invoke`
boundary. Its internal command table uses those same `SDK_RUNTIME_COMMANDS`
members as computed handler keys. The string values remain the wire contract on
`windie:invoke`, but the helper itself takes generic Electron-host dependencies
such as `ensureAgent`; the source of truth for adding or renaming a supported
SDK-shaped command is
`packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.ts`.

`desktopPendingTurnRuntimeClient.ts` owns the renderer adapter for the desktop
pending-turn IPC send channel. Chat hooks and message-send utilities update
their local store state, then call this runtime client instead of importing
desktop IPC channel constants directly.

`desktopLiveSurfaceTraceRuntimeClient.ts` owns the renderer adapter for the
live-surface trace IPC send channel. Chat stream debug utilities decide whether
to emit diagnostics and build redacted payloads, then call this runtime client
instead of importing desktop IPC channel constants directly.

`desktopWindowRuntimeClient.ts` owns renderer adapter calls for desktop window
commands used by generic runtime flows, such as restoring the chatbox after
overlay-origin sends, applying startup surface visibility, handling wakeword
chatbox restore, main-window controls, and minimal chatbox overlay focus, drag,
hit-test, visual-anchor, text-entry, hide/show commands, and main-window
open-target fan-out. Callers keep UI policy and call this runtime client instead
of importing window IPC channel constants directly.

`desktopResponseOverlayRuntimeClient.ts` owns renderer response overlay window
IPC for responsebox size, hit-test, and visibility fan-out. Response overlay
view-model/window-sync hooks keep overlay selection, stale-turn, sizing,
re-report, and scroll policy while delegating responsebox channel names to this
app runtime client.

`desktopArtifactRuntimeClient.ts` owns renderer adapter calls for desktop
artifact image commands used by generic message presentation, including
authenticated artifact image fetches and native image context-menu actions.
Message screenshot resolution and user screenshot presentation keep only display
policy and call this runtime client instead of importing artifact IPC channel
constants directly.

`desktopAppConfigRuntimeClient.ts` owns renderer config disk persistence and
settings-event fan-out for app-level config/status providers so those providers
do not import config persistence or settings-event channel constants directly.

`desktopClientSessionRuntimeClient.ts` owns renderer adapter calls for the
desktop client/session snapshot and IPC transport status subscription. Chat
session bootstrap, loop transport projection, dashboard user snapshot
fallback call this runtime client instead of importing `get-client-user-id` or
`ipc-status` channel constants directly. App config runtime snapshot handling
also calls this client for startup and connection-status user context.

`desktopConversationRuntimeEventClient.ts` owns renderer subscriptions for the
SDK conversation runtime fan-out channels: conversation events, pending turns,
current-turn projections, and display rows. `useChatStream`,
`useDashboardConversations`, and `useConversationRuntimeProjectionStream` retain
validation, stale-turn policy, list refresh/title polling, projection side
effects, and display-row merging while delegating channel names and
`IpcBridge.on(...)` calls to this app runtime client.

`desktopAudioRuntimeClient.ts` owns the renderer subscription to the untyped
backend `audio-chunk` side channel. Chat interface bindings keep audio payload
parsing and playback queue policy while delegating the channel subscription to
this app runtime client.

`desktopVoiceRuntimeClient.ts` owns renderer voice runtime commands and local
wakeword bridge IPC. Wakeword hooks keep capture lifecycle, cooldown,
thresholding, and local error policy while delegating wakeword audio chunks,
enable/disable sends, wakeword detected/status subscriptions, and app-level
wakeword-toggle fan-out to this app runtime client.

`desktopWorkspaceRuntimeClient.ts` owns the renderer subscription to workspace
access update fan-out. `ChatInterface` keeps active-workspace refresh,
conversation binding, and workspace-picked new-chat policy while delegating the
channel subscription to this app runtime client.

The previous renderer helper file `windieCommandInvokeClient.ts` and function
`invokeWindieCommand(...)` were renamed to
`agentSdkCommandInvokeClient.ts` and `invokeAgentSdkCommand(...)`. Inside that
renderer helper, the private bridge type/helper use `AgentSdkCommandBridge` and
`getAgentSdkCommandBridge(...)`. The preload bridge is still exposed as
`window.agentSdk`; the IPC channel string remains `windie:invoke` as the
existing wire contract.

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

`conversation.send`, `conversation.stop`, `conversation.rehydrate`, and
`conversation.compact` payloads sent from the renderer transport to main use
the canonical backend-transport command contract. `conversation.send` accepts:

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

The transport and Electron main query command boundary reject removed aliases such as
`conversationRef`, `screenshotRef`, `screenshotUrl`, `screenshotRefs`,
`attachmentContext`, `attachmentFilenames`, `workspacePath`, `turnRef`,
`queryMessageId`, `messageId`, `message_id`, or `id`.

If a caller passes removed aliases into `desktopRuntimeTransport` or
directly through `windie:invoke`, those fields fail fast. Fix the caller to send
the canonical snake_case runtime shape and use `query_message_id` for the turn
identifier instead of reintroducing alias fallback in the transport or main
query runtime.

`conversation.rehydrate` accepts `conversation_ref`, `messages`,
`rehydrate_mode`, and `workspace_path`; removed `conversationRef` and
`workspacePath` aliases fail fast. `conversation.compact` accepts `force` and
`conversation_ref`; removed `conversationRef` and `turnRef` aliases fail fast.
Electron main uses those snake_case fields only for the backend transport
commands. SDK library commands such as `conversation.loadDisplay`,
`conversation.prepareRetryTurn`, and `conversations.list` continue to require
SDK-shaped camelCase fields.

## Command Return and Error Contract

`sendQuery(...)`:

1. invokes `windie:invoke` with `conversation.send`
2. throws when main returns `{ ok: false, error }`
3. returns the accepted `messageId` from main when provided
4. otherwise returns the caller-provided message id

`compactHistory(...)`, `wakewordDetected(...)`, and `updateSettings(...)` return
the snake_case `turn_ref` when present. Removed `turnRef` aliases are rejected.

`stop(...)` sends only `conversation_ref` and `turn_ref` to
`conversation.stop`; camelCase stop aliases are rejected.

## Drift Hotspots

1. Re-adding query alias fallback in `desktopRuntimeTransport` or
   `ipc_query_runtime.cjs` keeps duplicate
   renderer command authorities alive and hides callers that failed to normalize
   at the SDK/runtime boundary.
2. Moving query enrichment into this adapter duplicates Electron main ownership.
3. Treating `DesktopRuntimeTransport` as a websocket client bypasses main-owned
   settings gates, overlay phase, replay buffers, and failure synthesis.
4. Letting `workspacePath` override `workspace_path` can send queries with stale
   workspace context after the active workspace binding has changed.

## Related Pages

- [Renderer Runtime](renderer_runtime.md)
- [Query Send and Stream Relay Change Workflow](../main/query_send_and_stream_relay_change_workflow.md)
- [Query Payload and Relay Reference](../main/query_payload_and_relay_reference.md)
- [IPC Channel and Handler Reference](../contracts/ipc_channel_and_handler_reference.md)
- [Session and Transcript Reference](../../reference/session_and_transcript_reference.md)
