---
summary: "Testing Guide"
read_when:
  - When adding tests or running CI.
---

# Testing Guide

For symptom-driven and subsystem-specific command selection, read [Test Selection](../debug/test_selection.md).

## Backend + Sidecar Tests

```bash
cd /path/to/WindieOS
<windie> test all
```

### Backend-Only Tests

```bash
cd /path/to/WindieOS
<windie> test backend
```

### Sidecar-Only Tests

```bash
cd /path/to/WindieOS
<windie> test sidecar
```

## Frontend Tests

```bash
cd frontend
npm test
```

## Frontend Lint + Audits

```bash
cd frontend
npm run typecheck
npm run lint
npm run lint:audit
npm run audit:jscpd
npm run audit:knip
```

- `npm run typecheck` runs `tsc --noEmit -p tsconfig.eslint.json`.
- `npm run lint` now scans `js/jsx/cjs/ts/tsx`.
- `npm run lint:audit` runs a React compiler audit and a TS deprecation audit.

## Notes

- Python tests are split by env automatically:
  - `tests/backend` runs with `jarvis`
  - `tests/sidecar` runs with `frontend_jarvis`
- `scripts\python-in-env.cmd` on Windows and `scripts/python-in-env.sh` on Unix-like shells use `conda run` when envs exist, otherwise fall back to the current shell env (CI-friendly).
- Sidecar protocol output normalization is covered by `tests/sidecar/test_stdout_json.py` (shared JSON-line writer).
- Local runtime bridge restart/readiness handling is covered by `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`.
- Wakeword bridge stale-buffer/stale-process restart behavior is covered by `tests/frontend/WakewordBridge.test.cjs`.
- For CI parity: `<windie> test frontend`.
- Frontend tests use Jest + React Testing Library.
- SDK/main tool routing behavior is covered by `tests/frontend/WindieSdkClient.test.ts`, `tests/frontend/WindieSdkConversationRuntime.test.ts`, and SDK tool-output tests.
- Transcript/session persistence behavior is covered through SDK projection and transcript-session tests such as `tests/frontend/WindieSdkConversationRuntime.test.ts` and `tests/frontend/TranscriptSessionState.test.ts`.
- Transcript storage/event and SDK display projection primitives are covered directly by `tests/frontend/TranscriptStorage.test.ts`, `tests/frontend/DesktopConversationStore.test.ts`, and `tests/frontend/SdkDisplayChatMessageProjection.test.ts`.
- Active chat-session reset behavior shared by chat and dashboard is covered directly by `tests/frontend/ResetActiveChatSession.test.ts`.
- Audio playback lifecycle behavior is covered directly by `tests/frontend/PlayerService.test.ts`.
- Message input submission/lockout behavior is covered directly by `tests/frontend/MessageInput.test.jsx`.
- Message row class composition (sender/type/streaming/screenshot) is covered directly by `tests/frontend/MessageListClasses.test.js`.
- Screenshot URL/data-URL resolution behavior is covered directly by `tests/frontend/MessageScreenshots.test.js`.
- Tool-output source and token metadata formatting behavior is covered directly by `tests/frontend/MessageSourceBadge.test.jsx` and `tests/frontend/DesktopMessageTokenUsageRuntime.test.js`.
- Message transparency section descriptor behavior is covered directly by `tests/frontend/DesktopMessageTransparencyRuntime.test.js`.
- Chat message sender helper behavior is covered directly by `tests/frontend/ChatMessageSenderUtils.test.ts`.
- Chat stream event helper behavior (error filtering/text, correlation id, screenshot attachment) is covered directly by `tests/frontend/ChatStreamEventUtils.test.ts`.
- Chat stream message-update helper behavior is covered directly by `tests/frontend/ChatStreamMessageUpdates.test.ts`.
- Tool message/mapping helper behavior is covered directly by chat stream and SDK projection tests.
- Shared renderer model selection/filter/reconciliation runtime behavior is covered directly by `tests/frontend/ModelSelectionUtils.test.js`.
- Dashboard model card and provider behavior is covered directly by `tests/frontend/ModelsSection.test.jsx`, `tests/frontend/ModelCardData.test.js`, and `tests/frontend/ModelSelectionUtils.test.js`.
