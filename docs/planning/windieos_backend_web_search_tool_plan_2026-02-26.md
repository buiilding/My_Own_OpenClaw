---
summary: "Implementation plan for a backend-native web search tool in WindieOS, including architecture changes needed to support backend tool execution in a frontend-first tool loop."
read_when:
  - Designing or implementing internet search capability for WindieOS.
  - Adding backend-executed tools in a runtime that currently assumes frontend/sidecar execution for tool turns.
  - Evaluating Brave Search API integration, security boundaries, and rollout strategy.
title: "Backend-Native Web Search Tool Plan (2026-02-26)"
---

# Backend-Native Web Search Tool Plan (2026-02-26)

## 1) WindieOS Primer (for readers new to the project)

WindieOS is a desktop AI operator:
- User chats with an assistant.
- Assistant can call tools (browser control, shell, file edits, screenshots, etc.).
- Assistant loops: think -> call tools -> observe results -> continue.

Current runtime split:
- Backend (Python/FastAPI):
  - LLM orchestration.
  - Tool schema exposure to model.
  - Tool-turn orchestration.
- Frontend (Electron + Python sidecar):
  - Actual execution of most tools (OS control, browser control, shell, files).

Today, tool turns are frontend-first by default:
- Backend sends `ToolCallEvent`/`ToolBundleEvent` toward frontend.
- Backend waits for frontend result futures.
- Backend processes returned results into conversation history.

Key files:
- Tool send path: `backend/src/agent/tools/sending/sender.py`
- Wait path: `backend/src/tools/single_tool_execution.py`
- Frontend-side execution registry: `frontend/src/main/python/tools/registry.py`

## 2) Why web search is different

Many Windie tools require user machine capabilities:
- Mouse/keyboard/scroll.
- Local shell.
- User desktop/browser session.

Internet web search does not require local user machine control.
It is better as backend-native execution because:
- No sidecar dependency.
- No local client API key distribution.
- Works uniformly for all clients.
- Cleaner trust boundary for outbound HTTP search calls.

## 3) Problem Statement

We need Codex-style web search capability (`search_query`-like retrieval), but Windie’s current tool orchestration path assumes frontend execution for tool turns.

If we add `web_search` as a normal tool without orchestration changes, backend may still try to route through frontend event flow, which is incorrect for backend-native HTTP search.

## 4) Goals / Non-Goals

Goals:
1. Ship `web_search` as backend-executed tool.
2. Preserve existing frontend-executed tool behavior.
3. Keep model-facing schema clean/simple.
4. Add robust retries/timeouts/error mapping for Brave API.
5. Keep UI transparency/events coherent.

Non-goals:
1. Re-architect all tools away from frontend execution.
2. Introduce multi-provider meta-search in v1.
3. Replace current browser automation tool.

## 5) Current Constraints in Code

Observed runtime assumptions:
1. Tool sender primarily emits frontend events and does not execute backend tools in normal path.
2. `execute_single_tool(...)` waits on request-id futures that are usually resolved by frontend result ingress.
3. Remote tool stubs dominate registered runtime tool surface.

Relevant files:
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/remote_tools/registry.py`
- `backend/src/tools/registry.py`

## 6) Proposed Design

### 6.1 High-level

Add a hybrid execution model:
- Frontend-executed tools: unchanged current flow.
- Backend-executed tools: execute directly in backend during send phase, then publish/store result for existing wait/process flow.

### 6.2 New Tool

Add `web_search` backend tool:
- Name: `web_search`
- Category: `SEARCH`-like utility category (or `OTHER` if category expansion deferred).
- Input:
  - `query: str` (required)
  - `count: int` (optional, default 5-10, bounded)
  - `recency_days: int | None`
  - `domains: list[str] | None`
- Output:
  - structured results array (`title`, `url`, `snippet`, optional `age`/`source`)
  - concise `llm_content` summary for model consumption

Provider v1:
- Brave Search API (`https://api.search.brave.com/res/v1/web/search`)
- Header: `X-Subscription-Token: BRAVE_API_KEY`

### 6.3 Execution Routing Contract

Introduce explicit execution target metadata in tool layer:
- `execution_target = "frontend" | "backend"`
- Default existing behavior remains frontend for current remote stubs.
- New `web_search` sets `execution_target = "backend"`.

Alternative (simpler, less explicit):
- Temporary allowlist in sender for backend-native tool names (`{"web_search"}`).
- This is lower-effort but less maintainable.

Preferred:
- Explicit metadata contract for future backend-native tools.

### 6.4 Orchestration Flow for backend-native tool

Single tool turn (backend-native):
1. Parser produces tool call with `request_id`.
2. Sender sees `execution_target == "backend"`.
3. Sender builds `ToolContext` via `ContextFactory`.
4. Sender executes tool directly (using direct executor or direct `tool.run(...)`).
5. Sender converts result to canonical `ToolResult`.
6. Sender stores result in session pending result storage (`register_pending_tool_result(request_id, result)`).
7. Sender emits frontend transparency events:
  - `ToolCallEvent` with `skip_frontend_execution=true`
  - `ToolOutputEvent` carrying backend result (optional but recommended for UI consistency)
8. Existing wait path in `execute_single_tool` immediately finds pending result and returns without timeout wait.

Bundle strategy (v1):
- Disallow backend-native tools inside bundles at first, return deterministic validation error.
- Later phase can support mixed bundles if needed.

## 7) Detailed Implementation Plan

### Phase A: Tool + Schema

Add files:
- `backend/src/tools/web_search/schemas.py`
- `backend/src/tools/web_search/tool.py`
- `backend/src/tools/web_search/__init__.py`

Register in backend registry:
- `backend/src/tools/registry.py`

Brave client behavior:
- Timeout budget (for example 12s).
- Retry on transient failures/429 with capped exponential backoff.
- Strict argument bounds:
  - `count` max bound (for example <= 20).
  - `domains` max item count and domain string sanity.

Error mapping:
- Missing key -> clear configuration error.
- 401/403 -> auth/plan error.
- 429 -> rate-limit error with retry hint.
- network timeout -> transient upstream timeout error.

### Phase B: Backend Execution Routing

Primary touchpoint:
- `backend/src/agent/tools/sending/sender.py`

Changes:
1. Determine tool instance from registry.
2. Branch by execution target.
3. For backend target:
  - run tool directly in backend.
  - store pending result by `request_id`.
  - emit protocol-safe call/output events with `skip_frontend_execution=true`.
4. Keep current frontend path untouched for remote tools.

Optional helper extraction:
- `backend/src/agent/tools/sending/backend_tool_runner.py`

### Phase C: Policy/Allowlist

Current chat-mode allowlist is narrow.
If `web_search` should work in chat mode, extend:
- `backend/src/core/config/models.py` (`get_tool_allowlist`)

If only agent mode needed, no allowlist update required for v1.

### Phase D: Docs + Contract Notes

Docs to update:
- `docs/architecture/tool_system.md`
- `docs/operations/configuration.md` (document `BRAVE_API_KEY`)
- `docs/planning/README.md` (this plan index)

## 8) Security + Privacy

Security requirements:
1. API key only on backend runtime.
2. No API key ever sent to frontend/sidecar.
3. Domain filter sanitize/validate input.
4. Outbound request logging must redact secrets.

Privacy notes:
- Search query text is sent to Brave provider.
- Must document this in user-facing privacy/security docs before broad release.

## 9) Observability

Add metrics/log fields:
- `tool_name=web_search`
- provider latency (ms)
- result count
- failure type (`auth`, `rate_limit`, `timeout`, `network`, `validation`)

Log quality:
- Include request correlation id.
- Never log API key.

## 10) Test Plan

### Backend unit tests

Add:
- `tests/backend/test_web_search_tool.py`

Cases:
1. happy path mapping.
2. empty/invalid query.
3. missing key.
4. 401/403 handling.
5. 429 handling.
6. timeout/network exception handling.
7. count/domains bounds.

### Orchestration tests

Add:
- `tests/backend/test_tool_sender_backend_native_execution.py`

Cases:
1. backend-native tool does not require frontend result ingress.
2. pending result is stored and consumed by `execute_single_tool`.
3. emitted event order remains protocol-safe.
4. frontend-executed tools remain unchanged.

### Regression tests

Verify existing suites still pass:
- remote tool contract parity tests should remain unchanged because `web_search` is not a sidecar remote tool.

## 11) Rollout Plan

Stage 1:
- Internal only, feature flag `WINDIE_WEB_SEARCH_ENABLED=1`.
- Agent mode only.

Stage 2:
- Enable by default in agent mode.
- Observe rate-limit/error metrics.

Stage 3:
- Optional chat-mode allowlist enablement if UX validated.

Rollback:
- Disable feature flag.
- Keep code path inert without deleting tool immediately.

## 12) Risks and Mitigations

Risk: sender changes break existing frontend tool flow.
- Mitigation: strict routing tests + no-op behavior for frontend target.

Risk: bundle/mixed execution complexity.
- Mitigation: v1 explicit no-mixed-bundle rule.

Risk: provider quota/rate limits.
- Mitigation: retries + clear model-visible error text + bounded count defaults.

Risk: context bloat from too many results.
- Mitigation: cap `count`; concise result formatting.

## 13) Acceptance Criteria

Ship-ready when:
1. `web_search` executes fully backend-side with Brave.
2. No sidecar implementation required for this tool.
3. Existing frontend tools still execute normally.
4. Tests for tool + sender routing + failure mapping are green.
5. Docs updated (tool system + config + planning index).

## 14) Execution Checklist

1. Add backend tool schema + implementation.
2. Register backend tool in backend registry.
3. Add execution target contract and sender routing branch.
4. Add orchestration tests for backend-native path.
5. Add Brave API integration tests (mocked HTTP).
6. Update allowlist policy if chat-mode support desired.
7. Update docs and release notes.

