---
summary: "Frontend IPC contracts docs sub-hub for typed channels, preload allowlists, and renderer-main handler ownership."
read_when:
  - When adding/modifying renderer-main ipc channels or preload exposure lists.
  - When debugging invoke/send/on contract drift between renderer and main.
title: "Frontend Contracts Docs Hub"
---

# Frontend Contracts Docs Hub

## Deep Pages

- [IPC Channels and Event Contracts](IPC_CHANNELS_AND_EVENT_CONTRACTS.md)
- [IPC Channel and Handler Reference](IPC_CHANNEL_AND_HANDLER_REFERENCE.md)
- [Backend Event Consumer Matrix Reference](BACKEND_EVENT_CONSUMER_MATRIX_REFERENCE.md)
- [Overlay and Wakeword Control Channel Reference](OVERLAY_AND_WAKEWORD_CONTROL_CHANNEL_REFERENCE.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/channels.cjs`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/*`
