---
summary: "Frontend renderer infrastructure audio docs sub-hub for PlayerService queue lifecycle, playback-generation stale-callback guards, and stop/cleanup error-tolerant behavior."
read_when:
  - When changing `frontend/src/renderer/infrastructure/audio/PlayerService.ts` queue or cleanup behavior.
  - When debugging overlapping audio playback, stuck `isPlaying` state, or dropped chunks after stop/new-query.
title: "Frontend Renderer Infrastructure Audio Docs Hub"
---

# Frontend Renderer Infrastructure Audio Docs Hub

## Deep Pages

- [Player Service Queue, Generation, and Error-Recovery Reference](player_service_queue_generation_and_error_recovery_reference.md)

## Code Scope

- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `tests/frontend/PlayerService.test.ts`
