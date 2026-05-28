---
summary: "Renderer-main IPC contract and SDK conversation event contract used by chat stream, tool runner, settings lifecycle, and permission onboarding channels."
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
- `frontend/src/renderer/types/backendEvents.ts`

## IPC Surface from Renderer

### `send` channels

Allowlisted examples:

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
- `windie:send`
- `windie:stop`
- `windie:update-settings`
- `windie:list-models`
- `windie:rehydrate`
- `windie:compact-history`
- `windie:wakeword-detected`
- `get-system-state`
- `search-memory`, `search-chat-conversations`, `store-memory`, list/get/delete memory records
- config load/save
- window management and display queries
- `get-displays` payload includes `{ id, label, isPrimary, bounds, scaleFactor }` from main-process display mapper
  - details: [Display Query Handler Display Inventory Payload Contract Reference](../main/display_query_handler_display_inventory_payload_contract_reference.md)
- sudo access toggle and permission onboarding channels
  - `set-agent-sudo-access`
    - Linux-only sudo flow: persistent enable is rejected and legacy sudoers cleanup uses `pkexec`
    - details: [Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference](../main/agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md)
  - `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`
- `show-main-window` supports optional `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`

### `on` channels

Inbound event streams:

- `windie:rows`
- `windie:status`
- `windie:conversation-event`
- `windie:current-turn`
- `ipc-status`
- `wakeword-status`
- `wakeword-detected`
- `wakeword-toggle`
- `main-window-open-target`
- `response-overlay-phase`

## SDK Conversation Event Contract in Renderer

`useChatStream` consumes SDK-normalized conversation events from
`windie:conversation-event`. Live display rows and current-turn state come from
`windie:rows` and `windie:current-turn`; renderer chat code should not subscribe
to raw backend websocket packets.

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
- `memory_stored`
- `usage_updated`
- `turn_error`

Type guards:

- SDK conversation event types and display row projections from
  `renderer/infrastructure/api/windieSdkClient.ts`

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
projection for live-turn display instead of separately interpreting raw backend
stream/tool events.

## Settings Sync Contract

Main process (`ipc.cjs`) enforces initial settings synchronization ACK before first query dispatch.

Behavioral contract:

- renderer pushes frontend-owned config via `windie:update-settings`
- main tracks pending ACK timeout
- first query waits for initial update-settings attempt path

## Contract Change Checklist

When changing any channel/event:

1. Update preload allowlist.
2. Update renderer channel constants and use sites.
3. Update main-process sender/handler implementation.
4. Update backend event types and stream handlers if applicable.
5. Update docs + tests.
