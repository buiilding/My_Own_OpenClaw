---
summary: "Renderer-main IPC contract and SDK conversation event contract used by chat stream projections, tool display, settings lifecycle, and permission onboarding channels."
read_when:
  - When adding/changing IPC channels.
  - When debugging renderer/main/backend event mismatches.
title: "IPC Channels and Event Contracts"
---

# IPC Channels and Event Contracts

Primary files:

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/main/ipc.cjs`
- `packages/windie-sdk-js/src/events/backendEvents.ts`

## IPC Surface from Renderer

### `send` channels

Allowlisted examples:

- `renderer-log`
- `live-surface-trace`
- `transcript-session-sync`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

### `invoke` channels

Key examples:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `upload-artifact`
- `fetch-artifact-image`
- SDK-shaped `windie:invoke` commands for conversation, settings, model,
  wakeword, memory, and conversation-library runtime actions
- `get-system-state`
- image clipboard/context-menu channels
- config load/save
- extension and MCP channels
- window management and display queries
- `get-displays` payload includes `{ id, label, isPrimary, bounds, scaleFactor }` from main-process display mapper
  - details: [Display Query Handler Display Inventory Payload Contract Reference](../main/display_query_handler_display_inventory_payload_contract_reference.md)
- permission onboarding channels
  - `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`, `set-active-workspace`
- `show-main-window` supports optional `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`

Internal local-runtime mapper names for chat-event store adapters and
local-runtime memory implementation details are not direct renderer preload invoke channels.
Renderer feature code should use `windie:invoke` SDK commands for user-facing
conversation and memory actions.

### `on` channels

Inbound event streams:

- `windie:rows`
- `windie:status`
- `windie:conversation-event`
- `windie:memory-store-changed`
- `windie:conversation-metadata-invalidated`
- `windie:current-turn`
- `transcript-session-sync`
- `ipc-status`
- `local-runtime-status`
- `wakeword-status`
- `wakeword-detected`
- `wakeword-toggle`
- `wakeword-stt-trigger`
- `chatbox-focus`
- `workspace-access-updated`
- `main-window-open-target`
- `response-overlay-phase`
- `backend-settings-event`
- `agent-capability-event`
- `audio-chunk`
- `response-overlay-visibility`

## SDK Conversation Event Contract in Renderer

`useChatStream` consumes SDK-normalized conversation events from
`windie:conversation-event`. Live current-turn state comes from
`windie:current-turn`, while normal chat display rows come from SDK
`ConversationView`; `windie:rows` remains compatibility/diagnostic transport.
Renderer chat code should not subscribe to backend-wire websocket packets.

Key normalized event families include:

- `reasoning_delta`
- `assistant_delta`
- `turn_completed`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool_call`
- `tool_bundle_call`
- `tool_output`
- `tool_bundle_output`
- `system_prompt`
- `tool_schemas`
- `user_message`
- `assistant_message`
- `usage_updated`
- `turn_error`

Type guards:

- SDK conversation event types and display row projections from
  `packages/windie-sdk-js`

## Overlay Phase Contract

Main process emits overlay phase updates consumed by renderer and chatbox/response overlays:

- `idle`
- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`

These phases gate UI behavior and stale-turn protection in tool execution.

## Conversation Runtime Projection Contract

Main process emits `windie:current-turn` from SDK runtime projection updates.
The payload is the SDK current-turn object. It contains:

- `conversationRef`
- `turnRef`
- `currentTurn`

`currentTurn` is SDK-owned runtime meaning, not a renderer-only message shape.
It includes the active turn phase, assistant text, reasoning text, tool events,
and last error. Dashboard and response overlay surfaces should consume this
projection for live-turn display instead of separately interpreting backend-wire
stream/tool events.

## Settings Sync Contract

Main process (`ipc.cjs`) enforces initial settings synchronization ACK before first query dispatch.

Behavioral contract:

- renderer pushes renderer-managed settings through `windie:invoke` command
  `settings.update`
- main tracks pending ACK timeout
- first query waits for initial update-settings attempt path

## Contract Change Checklist

When changing any channel/event:

1. Update `frontend/src/shared/ipcChannels.json`.
2. Update renderer expected channel key validation and use sites.
3. Update main-process sender/handler implementation.
4. Update backend event types and stream handlers if applicable.
5. Update docs + tests.
