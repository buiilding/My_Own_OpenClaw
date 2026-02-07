---
summary: "Testing Guide"
read_when:
  - When adding tests or running CI.
---

# Testing Guide

## Backend + Sidecar Tests

```bash
cd /path/to/WindieOS
pytest
```

### Sidecar-Only Tests

```bash
cd /path/to/WindieOS
pytest tests/sidecar
```

## Frontend Tests

```bash
cd frontend
npm test
```

## Notes

- `pytest` uses `pytest.ini` and runs `tests/backend` + `tests/sidecar`.
- Activate the Python environment that has backend/sidecar deps before running `pytest`.
- For CI parity: `cd frontend && npm run test:ci`.
- Frontend tests use Jest + React Testing Library.
- `tests/frontend/ToolRunnerHook.test.ts` covers backend-listener cleanup and malformed tool event guards to prevent false-positive dispatch behavior.
- Transcript/session persistence behavior is covered directly by `tests/frontend/TranscriptWriter.test.ts` and `tests/frontend/TranscriptSessionState.test.ts`.
- Transcript storage/event and queue primitives are covered directly by `tests/frontend/TranscriptStorage.test.ts` and `tests/frontend/TranscriptPendingQueue.test.ts`.
- Audio playback lifecycle behavior is covered directly by `tests/frontend/PlayerService.test.ts`.
- Message input submission/lockout behavior is covered directly by `tests/frontend/MessageInput.test.jsx`.
- Message row class composition (sender/type/streaming/screenshot) is covered directly by `tests/frontend/MessageListClasses.test.js`.
- Screenshot URL/data-URL resolution behavior is covered directly by `tests/frontend/MessageScreenshotSrc.test.js`.
- Chat message sender helper behavior is covered directly by `tests/frontend/ChatMessageSenderUtils.test.ts`.
- Episodic memory parsing/formatting helpers are covered directly by `tests/frontend/EpisodicMemoryUtils.test.js`.
- Dashboard model selection/filter/reconciliation helpers are covered directly by `tests/frontend/ModelSelectionUtils.test.js`.
- Dashboard display selection/speech-toggle helper behavior is covered directly by `tests/frontend/SettingsDisplayUtils.test.js`.
