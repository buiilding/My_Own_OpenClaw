---
title: Feature Path Durable Trace Completion Plan
date: 2026-06-11
status: completed
---

# Feature Path Durable Trace Completion Plan

## Goal

Add durable sanitized `trace_event` diagnostics for the remaining WindieOS
feature-path candidates that are not covered by the current trace ledger.

This follows the existing trace substrate:

- hidden SDK conversation `trace_event` rows
- SDK `TraceRecorder`
- backend `TraceEvent` stream envelopes
- `buildTraceTimeline()`
- renderer `loadTraceTimeline(...)`
- `bin/windie trace`
- sidecar `path_trace.py` helpers where the sidecar owns local work

## Scope Definition

"All feature paths" for this pass means the current feature-path candidate set
from the live docs/source map and the previous trace expansion plan. It does
not mean every helper function or every UI component.

Already covered paths are not counted as new work:

- `memory.retrieval`
- `screenshot.capture`
- `query.dispatch`
- `query.resources`
- `backend.stream`
- `backend.prompt`
- `provider.call`
- `conversation.rehydrate`
- `compaction.lifecycle`
- `backend.compaction`
- `tool.execution`
- `sidecar.rpc`
- `artifact.upload`
- `memory.persistence`
- `title.generation`
- `settings.sync`
- `model.catalog`

## Remaining Feature Paths

Implement durable trace rows for these feature paths where a real producer can
emit or hand off sanitized facts into the existing ledger:

| # | Path | Owner boundary | Safe metadata |
| --- | --- | --- | --- |
| 1 | `artifact.fetch` | SDK artifact client, Electron main artifact IPC, backend artifact API | artifact id, content type, status code, byte count if known, URL/base presence, duration, short error |
| 2 | `overlay.phase` | SDK current-turn projection for conversation phase, Electron main overlay phase IPC for window phase | phase before/after, source runtime, visible/mode booleans, reason enum, duration |
| 3 | `permission.probe` | Electron main permission IPC/service, sidecar platform probe when local execution owns it | permission id, platform, probe/request mode, granted boolean, status enum, prompt/open-settings boolean, duration, short error |
| 4 | `browser.runtime` | sidecar browser runtime/tool, SDK tool execution handoff | browser action, mode, connected boolean, tab count, launch/reuse booleans, duration, short error |
| 5 | `tool.schema.policy` | backend tool catalog/policy projection and SDK/client manifest handoff | tool count, local/remote count, enabled/disabled counts, provider projection mode, policy profile, duration, short error |
| 6 | `websocket.control` | SDK backend transport and backend websocket non-query handlers | message type, request id, accepted boolean, active turn/session booleans, duration, short error |
| 7 | `voice.transcription` | renderer voice capture boundary, backend transcription route/provider | session id, chunk count, byte count, sample rate, provider, terminal status, duration, short error |
| 8 | `tts.playback` | backend TTS session/chunks and renderer playback control | session id, chunk count, byte count, voice id presence, started/completed/failed status, duration, short error |
| 9 | `wakeword.runtime` | Electron main wakeword bridge and Python wakeword subprocess | enabled boolean, ready boolean, model id/kind, audio chunk count, detection boolean, duration, short error |
| 10 | `extension.load` | SDK/Electron extension package loader and sidecar plugin registration | extension id, contribution counts, enabled boolean, runtime owner, duration, short error |
| 11 | `mcp.tool` | SDK/Electron MCP server config and tool manifest contribution | server id, tool count, enabled boolean, transport mode, duration, short error |
| 12 | `workspace.context` | renderer workspace selection, Electron permission/runtime, SDK query resource handoff | workspace selected boolean, source kind, has path boolean, repo instructions present boolean, duration, short error |
| 13 | `install.auth` | backend install auth routes and SDK/Electron endpoint auth client | token/install id presence booleans, route/action enum, status code, refresh/register mode, duration, short error |
| 14 | `run.control` | backend VM run control service and Electron VM worker runtime | run id, control/action, status before/after, event count, worker assigned boolean, duration, short error |
| 15 | `sidecar.lifecycle` | SDK local sidecar runtime, Electron sidecar launch-option assembly, sidecar daemon readiness | launch mode, reused boolean, ready boolean, backend/auth context match booleans, pid presence, duration, short error |
| 16 | `agent.definition` | SDK `WindieAgent` request shaping and backend query validation | tool/plugin/MCP/skill counts, workspace presence, local runtime availability, schema mode, duration, short error |

## Hard Boundaries

- Do not persist user text, prompt text, memory text, embedding vectors,
  screenshots, file contents, shell output, raw provider payloads, tokens,
  credentials, raw SQL rows, raw artifact bytes, audio bytes, browser page
  text, URLs containing secrets, or stack traces.
- Renderer may read persisted diagnostics but must not invent truth for SDK,
  Electron main, sidecar, backend, or provider behavior.
- For global feature paths, add a real producer-owned handoff into the
  conversation trace ledger only when there is a conversation/turn owner. If a
  path has no conversation scope, document the producer gap in the report
  before adding a new storage model.
- Do not add a second trace table or a renderer-only diagnostics store in this
  pass.

## Implementation Order

1. Add reusable SDK helpers for producer-owned feature trace wrappers where the
   conversation runtime already has a turn or control context.
2. Implement SDK/conversation-scoped paths first:
   `websocket.control`, `agent.definition`, `workspace.context`,
   `artifact.fetch`, and `sidecar.lifecycle`.
3. Implement backend-streamed paths:
   `tool.schema.policy`, `install.auth`, `run.control`,
   `voice.transcription`, and `tts.playback`.
4. Implement Electron/main and sidecar-owned paths through existing
   conversation-scoped handoffs:
   `overlay.phase`, `permission.probe`, `browser.runtime`,
   `wakeword.runtime`, `extension.load`, and `mcp.tool`.
5. Update `docs/debug/runtime_traces.md`, `CHANGELOG.md`, and the matching
   report.
6. Run focused SDK/frontend/backend/sidecar/docs validation, reopen the plan
   and report against the live tree, then commit the isolated trace-expansion
   files.

## Testing Plan

For each implemented path:

- Prove the producer emits sanitized metadata from the owning runtime.
- Prove hidden `trace_event` rows are excluded from display and rehydrate
  projections.
- Prove `buildTraceTimeline(..., { path })` returns the path rows.
- Prove sensitive fields are redacted or absent.
- Use existing focused tests first; add new tests only at the producer/consumer
  boundary that moves.

Minimum validation:

- `bin/windie docs list`
- `bin/windie test frontend -- WindieSdkConversationRuntime.test.ts`
- focused frontend IPC/runtime tests for Electron-owned paths
- focused backend tests for backend-owned paths
- focused sidecar tests for browser/wakeword/local authority paths
- `git diff --check`
