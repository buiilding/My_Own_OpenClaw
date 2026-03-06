---
summary: "Renderer-main IPC contract and backend event contract used by chat stream, tool runner, settings lifecycle, and permission onboarding channels."
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

- `to-backend`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

### `invoke` channels

Key examples:

- `execute-tool`
- `upload-artifact`
- `get-system-state`
- `search-memory`, `search-conversations`, `store-memory`, list/get/delete memory records
- config load/save
- window management and display queries
- `get-displays` payload includes `{ id, label, isPrimary, bounds, scaleFactor }` from main-process display mapper
  - details: [Display Query Handler Display Inventory Payload Contract Reference](../main/display_query_handler_display_inventory_payload_contract_reference.md)
- sudo access toggle and permission onboarding channels
  - `set-agent-sudo-access`
    - Linux-only privileged toggle (`pkexec` enable + `sudo -n` disable)
    - details: [Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference](../main/agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md)
  - `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`
- `show-main-window` supports optional `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`

### `on` channels

Inbound event streams:

- `from-backend`
- `ipc-status`
- `wakeword-status`
- `wakeword-detected`
- `wakeword-toggle`
- `main-window-open-target`
- `response-overlay-phase`

## Backend Event Contract in Renderer

`useChatStream` handles core backend event types:

- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool-call`
- `tool-bundle`
- `tool-output`
- `system-prompt`
- `tool-schemas`
- `user-message-full`
- `assistant-message-full`
- `memory-store`
- `token-count`
- `error`
- local helper events (for optimistic/session handling)

Type guards:

- `isBackendEvent` and event-specific payload typings in `backendEvents.ts`

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

## Settings Sync Contract

Main process (`ipc.cjs`) enforces initial settings synchronization ACK before first query dispatch.

Behavioral contract:

- renderer pushes frontend-owned config via `update-settings`
- main tracks pending ACK timeout
- first query waits for initial update-settings attempt path

## Contract Change Checklist

When changing any channel/event:

1. Update preload allowlist.
2. Update renderer channel constants and use sites.
3. Update main-process sender/handler implementation.
4. Update backend event types and stream handlers if applicable.
5. Update docs + tests.
