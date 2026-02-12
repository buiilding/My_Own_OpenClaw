---
summary: "Multi-User Runtime Hardening"
read_when:
  - When running one backend for multiple users/devices.
  - When changing WebSocket identity/session lifecycle behavior.
  - When changing semantic summarization model/session selection.
---

# Multi-User Runtime Hardening

## Purpose

Define current multi-user runtime risks and required hardening rules for shared backend deployments.

Scope:
- WebSocket identity/session lifecycle
- Per-user model/config isolation
- Semantic summarization model selection
- Multi-device behavior for one user_id

## Current Runtime Behavior

1. WebSocket handshake accepts a client-provided `user_id` (`/ws` handshake payload).
2. Backend session cache is keyed by `user_id` (`SessionManager.active_sessions[user_id]`).
3. Connection cleanup calls `end_session(user_id)` on disconnect.
4. Semantic summarization uses the request `user_id` session config when present.
5. If no session exists for request `user_id`, semantic summarize falls back to global config.

## Primary Risks

1. `user_id` collision across machines:
   - Two machines using the same `user_id` share one session/config/history.
   - One disconnect can tear down the shared session for the other connection.
2. `user_id` spoofing:
   - `user_id` is validated for format, not ownership/authentication.
3. Same-user multi-device races:
   - Concurrent `update-settings`, `rehydrate-conversation`, and `query` calls can interleave state.
4. Semantic summarize global fallback mismatch:
   - If request `user_id` has no live session and global provider differs, summarize can fail or use wrong provider.

## Required Safety Invariants

1. Session ownership:
   - A session belongs to exactly one authenticated identity.
2. Per-user model isolation:
   - Semantic summarize must use that same user's active session model/provider when available.
   - Never borrow another user's active session config.
3. Cleanup correctness:
   - Do not destroy user session state while another active connection for that user remains.
4. Deterministic policy:
   - Same-user multi-device behavior must be explicitly configured (single-writer or concurrent).

## Recommended Hardening Plan

## Phase 1: Identity + Session Safety (must-have)

1. Derive `user_id` server-side from auth claims; stop trusting client identity input.
2. Track active connection count per `user_id`; only call `end_session(user_id)` when count reaches zero.
3. Add `connection_id` and `device_id` to runtime context and logs.

## Phase 2: Multi-Device Policy (must choose one)

1. Single-writer:
   - Latest device becomes writer; previous writer is downgraded or disconnected.
2. Multi-device with lock:
   - One writer token for mutating calls (`query`, `update-settings`, `rehydrate-conversation`).
3. Fully concurrent:
   - Version/ETag checks for settings and conversation pointer updates.

## Phase 3: Summarization Robustness

1. Keep semantic summarize per-user scoped to request session config.
2. If no live session exists for request user:
   - Explicitly skip/defer summarization, or
   - Use validated persisted per-user model config (not global default).
3. Isolate failures per user/conversation batch so one failure does not block others.

## Operational Checklist

Before shared deployment:
1. Auth enabled for websocket + REST.
2. Server-issued identity mapping enabled.
3. Connection-count-aware session cleanup enabled.
4. Multi-device policy selected and documented.
5. Per-user summarize model selection validated in logs.
6. Rate limits enabled per user and per endpoint class.

## Test Matrix (minimum)

1. Two users, two machines:
   - Distinct sessions, distinct model configs, no history bleed.
2. Same user, two machines:
   - Policy behavior matches configured mode.
3. One machine disconnects:
   - Session persists if another connection for same user remains.
4. Semantic summarize:
   - Uses correct per-user active model.
   - Never uses another user's model/session config.

## Related Docs

- `docs/SECURITY.md`
- `docs/COMMUNICATION_FLOW.md`
- `docs/MEMORY_SYSTEM.md`
- `docs/SECURITY_AND_COMPLIANCE.md`
