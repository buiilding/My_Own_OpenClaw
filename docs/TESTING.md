---
summary: "Testing Guide"
read_when:
  - When adding tests or running CI.
---

# Testing Guide

## Backend + Sidecar Tests

```bash
cd /path/to/WindieOS
./scripts/test
```

### Backend-Only Tests

```bash
cd /path/to/WindieOS
./scripts/test-backend
```

### Sidecar-Only Tests

```bash
cd /path/to/WindieOS
./scripts/test-sidecar
```

## Frontend Tests

```bash
cd frontend
npm test
```

## Notes

- Python tests are split by env automatically:
  - `tests/backend` runs with `jarvis`
  - `tests/sidecar` runs with `frontend_jarvis`
- `scripts/python-in-env` uses `conda run` when envs exist, otherwise falls back to the current shell env (CI-friendly).
- Sidecar protocol output normalization is covered by `tests/sidecar/test_stdout_json.py` (shared JSON-line writer).
- For CI parity: `cd frontend && npm run test:ci`.
- Frontend tests use Jest + React Testing Library.
- `tests/frontend/ToolRunnerHook.test.ts` covers backend-listener cleanup and malformed tool event guards to prevent false-positive dispatch behavior.
- Transcript/session persistence behavior is covered directly by `tests/frontend/TranscriptWriter.test.ts` and `tests/frontend/TranscriptSessionState.test.ts`.
- Transcript storage/event and queue primitives are covered directly by `tests/frontend/TranscriptStorage.test.ts` and `tests/frontend/TranscriptPendingQueue.test.ts`.
- Audio playback lifecycle behavior is covered directly by `tests/frontend/PlayerService.test.ts`.
- Message input submission/lockout behavior is covered directly by `tests/frontend/MessageInput.test.jsx`.
- Message row class composition (sender/type/streaming/screenshot) is covered directly by `tests/frontend/MessageListClasses.test.js`.
- Screenshot URL/data-URL resolution behavior is covered directly by `tests/frontend/MessageScreenshotSrc.test.js`.
- Tool-output execution metadata formatting behavior is covered directly by `tests/frontend/MessageToolMetadata.test.js`.
- Chat message sender helper behavior is covered directly by `tests/frontend/ChatMessageSenderUtils.test.ts`.
- Chat stream event helper behavior (error filtering/text, correlation id, screenshot attachment) is covered directly by `tests/frontend/ChatStreamEventUtils.test.ts`.
- Chat stream message-update helper behavior is covered directly by `tests/frontend/ChatStreamMessageUpdates.test.ts`.
- Tool-runner message/mapping helper behavior is covered directly by `tests/frontend/ToolRunnerMessages.test.ts`.
- Episodic memory parsing/formatting helpers are covered directly by `tests/frontend/EpisodicMemoryUtils.test.js`.
- Dashboard model selection/filter/reconciliation helpers are covered directly by `tests/frontend/ModelSelectionUtils.test.js`.
- Dashboard display selection/speech-toggle helper behavior is covered directly by `tests/frontend/SettingsDisplayUtils.test.js`.
