---
title: Feature Path Durable Trace Completion Report
date: 2026-06-11
status: completed
plan: ./2026-06-11-feature-path-durable-trace-completion-plan.md
---

# Feature Path Durable Trace Completion Report

## Status

Completed.

## Scope

Complete durable sanitized `trace_event` coverage for the remaining current
feature-path candidate set without adding renderer-invented diagnostics or a
second trace store.

## Checklist

- [x] `artifact.fetch`
- [x] `overlay.phase`
- [x] `permission.probe`
- [x] `browser.runtime`
- [x] `tool.schema.policy`
- [x] `websocket.control`
- [x] `voice.transcription`
- [x] `tts.playback`
- [x] `wakeword.runtime`
- [x] `extension.load`
- [x] `mcp.tool`
- [x] `workspace.context`
- [x] `install.auth`
- [x] `run.control`
- [x] `sidecar.lifecycle`
- [x] `agent.definition`
- [x] Runtime trace docs updated.
- [x] Changelog updated.
- [x] Focused validation recorded.
- [x] Final design-inspection pass completed against the plan.

## Decisions

- Keep the SDK conversation event ledger as the durable trace storage.
- Keep producer ownership strict: SDK records SDK facts, backend emits backend
  trace envelopes, Electron/main and sidecar paths need a real handoff before
  their facts are persisted.
- Treat non-conversation feature paths as eligible only when an existing
  conversation/turn/control operation owns the path. Do not create global trace
  storage in this pass.
- `voice.transcription` uses backend-owned transcription websocket
  `trace_event` diagnostics because `/ws/transcription` is not the normal
  conversation websocket.
- `run.control` uses the existing backend VM run timeline because VM runs have
  their own run id and event stream rather than SDK conversation ownership.
- `permission.probe` persists through the Electron main trace handoff when an
  active conversation exists; otherwise it skips durable storage instead of
  inventing a synthetic conversation.

## Validation Log

- 2026-06-11: `bin/windie docs list` passed during orientation.
- 2026-06-11: `bin/windie test frontend -- PermissionIpcRuntime.test.cjs DesktopVoiceRuntimeClient.test.ts WindieSdkConversationRuntime.test.ts` passed, 136 tests.
- 2026-06-11: `bin/windie test frontend -- WindieSdkClient.test.ts -t "agent global helpers persist sanitized feature path traces"` passed, 1 selected test.
- 2026-06-11: `bin/windie test backend -- tests/backend/test_transcription_gateway.py tests/backend/test_run_control_routes.py tests/backend/test_query_execution_service_helpers.py tests/backend/test_interaction_loop.py tests/backend/test_interaction_loop_compaction.py` passed, 63 tests.
- 2026-06-11: `npm run build:cjs` passed in `packages/windie-sdk-js`.
- 2026-06-11: `./scripts/python-in-env backend black ...` reformatted the touched backend/test Python files.
- 2026-06-11: `git diff --check` passed for the trace implementation files.

## Implementation Log

- 2026-06-11: Created this plan/report after inventorying the completed trace
  expansion, runtime trace docs, ownership docs, and code surface index.
- 2026-06-11: Added SDK conversation trace rows for artifact fetch, overlay
  projection, browser runtime, tool schema policy, websocket controls,
  wakeword activation, extension/MCP contributions, workspace context,
  install identity, sidecar lifecycle, and agent definition shape.
- 2026-06-11: Added Electron main permission probe trace handoff into the
  active SDK conversation ledger.
- 2026-06-11: Added backend-owned traces for TTS playback, transcription
  gateway behavior, and VM run-control timeline events.
- 2026-06-11: Rebuilt SDK CJS output so Electron main imports the updated
  runtime trace implementation.

## Blockers

- No active blockers. The only bounded durability caveat is intentional:
  transcription and VM run control follow their owning non-conversation
  timelines rather than adding a second global trace store.
