---
summary: "Testing Guide"
read_when:
  - When adding tests or running CI.
---

# Testing Guide

For symptom-driven and subsystem-specific command selection, read [Test Selection](../debug/test_selection.md).

## Backend + Local-Runtime Python Tests

```bash
cd /path/to/WindieOS
<windie> test all
```

### Backend-Only Tests

```bash
cd /path/to/WindieOS
private backend tests
```

### Local-Runtime Python Tests

```bash
cd /path/to/WindieOS
<windie> test local-runtime
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
  - private backend tests runs with `jarvis`
  - `tests/sidecar` runs with `frontend_jarvis`
- `scripts\python-in-env.cmd` on Windows and `scripts/python-in-env.sh` on Unix-like shells use `conda run` when envs exist, otherwise fall back to the current shell env (CI-friendly).
- Local-runtime protocol output normalization is covered by `tests/sidecar/test_stdout_json.py` (shared JSON-line writer).
- Local runtime bridge restart/readiness handling is covered by `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`.
- Wakeword bridge stale-buffer/stale-process restart behavior is covered by `tests/frontend/WakewordBridge.test.cjs`.
- For CI parity: `<windie> test frontend`.
- Frontend tests use Jest + React Testing Library.
- SDK/main tool routing behavior is covered by `tests/frontend/AgentSdkClient.test.ts`, `tests/frontend/AgentSdkConversationRuntime.test.ts`, and SDK tool-output tests.
- Transcript/session persistence behavior is covered through SDK projection and transcript-session tests such as `tests/frontend/AgentSdkConversationRuntime.test.ts` and `tests/frontend/TranscriptSessionState.test.ts`.
- Transcript storage/event and SDK display projection primitives are covered directly by `tests/frontend/TranscriptStorage.test.ts`, `tests/frontend/DesktopConversationStore.test.ts`, and `tests/frontend/SdkDisplayChatMessageProjection.test.ts`.
- Active chat-session reset behavior shared by chat and dashboard is covered directly by `tests/frontend/ResetActiveChatSession.test.ts`.
- Audio playback lifecycle behavior is covered directly by `tests/frontend/PlayerService.test.ts`.
- Message input submission/lockout behavior is covered directly by `tests/frontend/MessageInput.test.jsx` and `tests/frontend/DesktopMessageInputRuntime.test.js`.
- Message-list scroll/action/compaction presentation state is covered directly by `tests/frontend/DesktopMessageListRuntime.test.js` and `tests/frontend/MessageListScrollBehavior.test.jsx`.
- Message row class composition (sender/type/streaming/screenshot) is covered directly by `tests/frontend/DesktopMessageClassRuntime.test.js`.
- Attachment artifact-image resolution behavior is covered directly by `tests/frontend/DesktopAttachmentImageRuntime.test.jsx` and `tests/frontend/AttachmentDisplayComponents.test.jsx`.
- Tool-output source and token metadata formatting behavior is covered directly by `tests/frontend/MessageSourceBadge.test.jsx` and `tests/frontend/DesktopMessageTokenUsageRuntime.test.js`.
- Message transparency section descriptor behavior is covered directly by `tests/frontend/DesktopMessageTransparencyRuntime.test.js`.
- Thread-find match projection behavior is covered directly by `tests/frontend/DesktopThreadFindRuntime.test.js`.
- Chat message sender helper behavior is covered directly by `tests/frontend/DesktopChatSendStateRuntime.test.ts`.
- Chat stream event payload behavior (error filtering/text and screenshot attachment normalization) is covered directly by `tests/frontend/DesktopChatStreamEventPayloadRuntime.test.ts`.
- Chat stream message-update helper behavior is covered directly by `tests/frontend/DesktopChatStreamMessageUpdateRuntime.test.ts`.
- Tool message/mapping helper behavior is covered directly by chat stream and SDK projection tests.
- Chat header provider/model/reasoning option projection is covered directly by `tests/frontend/DesktopChatModelOptionsRuntime.test.js`.
- Shared renderer model selection/filter/reconciliation runtime behavior is covered directly by `tests/frontend/ModelSelectionUtils.test.js`.
- Dashboard model card and provider behavior is covered directly by `tests/frontend/ModelsSection.test.jsx`, `tests/frontend/DesktopModelCardPresentationRuntime.test.js`, and `tests/frontend/ModelSelectionUtils.test.js`.
