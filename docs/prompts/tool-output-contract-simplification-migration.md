---
summary: "Orchestrator guide to simplify WindieOS tool-result output: remove `is_preformatted`, always include system state, include screenshots only for computer-use tools."
read_when:
  - When changing frontend/backend tool-result payload contracts.
  - When aligning WindieOS tool-output behavior with Codex-style trust of tool output content.
  - When coordinating multi-agent changes across schemas, formatter logic, receiver logic, and tests.
---

# Tool Output Contract Simplification Migration (WindieOS)

## Goal

Replace the current preformatted-flag flow with a simpler contract:

1. Frontend sends final `llm_content` and backend receives it as-is.
2. Remove `is_preformatted` from frontend payloads and backend schemas/logic.
3. Always include `system_state.active_window` and `system_state.mouse_position` in model-facing tool output context.
4. Include screenshot data/reference only for computer-use tools.
5. Keep bundle envelope fields for orchestration/correlation, not for model-facing formatting control.

## Decision (Strict)

1. `is_preformatted` is removed everywhere (frontend, backend schema, handler, receiver, tests, docs).
2. Backend does not perform extra semantic validation of frontend `llm_content` formatting.
3. Backend still trusts frontend-generated `llm_content` for history when present.
4. `system_state` is required in tool-result model-facing context, with:
   - `active_window`
   - `mouse_position`
5. Screenshot fields are conditional:
   - computer-use tool: include `screenshot_ref` (or legacy `screenshot`)
   - non-computer tool: omit screenshot fields
6. Keep bundle transport fields (`bundle_id`, `status`, `step_results`) to preserve atomic multi-tool execution behavior in WindieOS.

## Codex Comparison (Reference Behavior)

Codex tool calls are correlated per call id and returned as separate tool outputs (including parallel calls), rather than a WindieOS-style bundle envelope.

Implication for WindieOS:
- Keep bundle fields for transport/correlation because WindieOS uses atomic bundled execution.
- Do not use bundle/preformatted flags to control backend history formatting.
- Let frontend message content be the source of truth for model-facing text.

## Canonical Target Contracts

### `tool-result` (frontend -> backend)

```json
{
  "type": "tool-result",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "data": {
      "llm_content": "run_shell_command output:\n...\n<system_context>...</system_context>",
      "system_state": {
        "active_window": "Terminal",
        "mouse_position": "(845, 512)"
      },
      "screenshot_ref": "artifact-id.png"
    },
    "error": null
  }
}
```

Notes:
- `screenshot_ref` shown above is only for computer-use tools.
- For non-computer tools, omit screenshot fields.
- No `metadata.is_preformatted`.

### `tool-bundle-result` (frontend -> backend)

```json
{
  "type": "tool-bundle-result",
  "payload": {
    "bundle_id": "bundle-123",
    "status": "success",
    "step_results": [
      { "tool": "run_shell_command", "status": "ok", "output": "Port 8050 cleared" }
    ],
    "system_state": {
      "active_window": "Terminal",
      "mouse_position": "(845, 512)"
    },
    "screenshot_ref": "bundle-artifact.png",
    "error": null
  }
}
```

Notes:
- Keep bundle fields for orchestration and correlation.
- Screenshot remains optional and only present when bundle includes computer-use actions.

## Before / After (Using Provided `run_shell_command` Example)

### Before (current contract shape)

```json
{
  "type": "tool-result",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "data": {
      "llm_content": "run_shell_command output:\nCommand: fuser -k 8050/tcp 2>/dev/null || echo \"Port 8050 cleared\"\nDirectory: /home/peter-bui\nOutput:\nPort 8050 cleared\n\nExit Code: 0\nStatus: Success\nExecution Time: 0.01 seconds\nstatus: successful\n<system_context>\n    <os_state>\n        <active_window>Unknown</active_window>\n        <mouse_position>Unknown</mouse_position>\n    </os_state>\n</system_context>",
      "is_preformatted": true
    },
    "error": null,
    "metadata": {
      "is_preformatted": true
    }
  }
}
```

### After (target contract shape)

```json
{
  "type": "tool-result",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "data": {
      "llm_content": "run_shell_command output:\nCommand: fuser -k 8050/tcp 2>/dev/null || echo \"Port 8050 cleared\"\nDirectory: /home/peter-bui\nOutput:\nPort 8050 cleared\n\nExit Code: 0\nStatus: Success\nExecution Time: 0.01 seconds\nstatus: successful\n<system_context>\n    <os_state>\n        <active_window>Unknown</active_window>\n        <mouse_position>Unknown</mouse_position>\n    </os_state>\n</system_context>",
      "system_state": {
        "active_window": "Unknown",
        "mouse_position": "Unknown"
      }
    },
    "error": null
  }
}
```

Delta summary:
- Removed `data.is_preformatted`.
- Removed `payload.metadata.is_preformatted`.
- Retained trusted `llm_content`.
- Kept required system state fields.

## Source Pack (Read Before Coding)

- `backend/src/api/schemas/incoming.py`
- `backend/src/api/handlers/tool_result.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/core/interfaces/tool.py`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`
- `docs/API_REFERENCE.md`
- `docs/COMMUNICATION_FLOW.md`

## Agent Count

Use **5 agents**.

Why 5:
- One contract/schema pass first.
- Two implementation passes in parallel (frontend and backend).
- One test migration pass.
- One docs/integration pass to close remaining drift.

## Execution Graph

1. Agent 1 (sequential, contract freeze)
2. Agent 2 + Agent 3 (parallel, both depend on Agent 1)
3. Agent 4 (sequential, depends on Agent 2+3)
4. Agent 5 (sequential, final integration/QA)

## Agent 1: Contract Freeze + Schema Updates

### Mission

Freeze the new payload contract with no `is_preformatted`.

### Own These Files

- `backend/src/api/schemas/incoming.py`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/types/schema.ts` (if generated/committed)

### Tasks

1. Remove `ToolResultMetadata` and `payload.metadata` for `tool-result`.
2. Define `system_state` contract shape with required `active_window` and `mouse_position` in tool-result data contract.
3. Keep bundle fields unchanged except clarify screenshot conditional behavior.

### Done Criteria

- No incoming schema path references `is_preformatted`.
- Type generation/build passes for schema consumers.

## Agent 2: Frontend Payload + Capture Logic (Parallel)

### Mission

Frontend sends trusted final `llm_content` without preformatted flags.

### Own These Files

- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`

### Tasks

1. Remove `is_preformatted` writes from tool-result payload builders.
2. Ensure each tool-result carries system state with `active_window` + `mouse_position` (fallback to `"Unknown"` if unavailable).
3. Ensure screenshot fields are only attached for computer-use tool results.
4. Preserve existing `llm_content` formatting behavior and trust model.

### Done Criteria

- Frontend never emits `is_preformatted`.
- Non-computer tool results omit screenshot fields.
- Computer-use tool results include screenshot reference when available.

## Agent 3: Backend Receiver + History Formatting (Parallel)

### Mission

Backend receives/forwards content without preformatted-flag logic.

### Own These Files

- `backend/src/api/handlers/tool_result.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/core/interfaces/tool.py`
- `backend/src/agent/tools/processing/synthetic_factory.py`

### Tasks

1. Delete metadata sanitizer path for `is_preformatted`.
2. Remove receiver logic that copies `is_preformatted` from data into metadata.
3. Simplify `ToolResult.format_for_history()`:
   - trust `llm_content` when present
   - fallback to error/data text when missing
   - no preformatted flag branch
4. Keep system_state propagation behavior intact.

### Done Criteria

- No backend runtime branch depends on `is_preformatted`.
- History formatting still works for success/failure and synthetic results.

## Agent 4: Tests Migration

### Mission

Update tests to the new flagless contract and required system-state behavior.

### Own These Files

- `tests/backend/test_tool_result_receiver.py`
- `tests/backend/test_tool_result_formatting.py`
- `tests/backend/test_api_handlers.py`
- `tests/frontend/ToolExecutionPayloads.test.ts`
- `tests/frontend/ToolExecutionService.test.ts`
- Any impacted contract/type tests

### Tasks

1. Remove assertions expecting `is_preformatted`.
2. Add assertions that system_state includes `active_window` + `mouse_position`.
3. Add assertions for screenshot inclusion only in computer-use paths.
4. Keep bundle behavior tests for `bundle_id`/`step_results`.

### Done Criteria

- Full backend + frontend test suites for touched areas pass.

## Agent 5: Docs + Integration QA

### Mission

Eliminate documentation drift and verify end-to-end behavior.

### Own These Files

- `docs/API_REFERENCE.md`
- `docs/COMMUNICATION_FLOW.md`
- `docs/TOOL_SYSTEM.md` (if contract examples are present)
- `docs/FRONTEND_ARCHITECTURE.md` / `docs/BACKEND_ARCHITECTURE.md` sections if needed

### Tasks

1. Remove `is_preformatted` references from public/internal docs.
2. Update tool-result examples to show required system_state fields and conditional screenshot behavior.
3. Add one end-to-end verification note:
   - single non-computer tool result
   - single computer-use tool result
   - one bundled execution result

### Done Criteria

- No docs mention `is_preformatted`.
- API examples match runtime payloads.
- Integration checks confirm expected payload shape.

## Risk Controls

1. Do not remove bundle fields; they are needed for WindieOS atomic bundle orchestration.
2. Keep legacy `screenshot` field handling only as fallback while favoring `screenshot_ref`.
3. If system-state capture fails, emit `"Unknown"` values for required keys instead of omitting the fields.
4. Avoid adding new frontend/backend coupling flags after `is_preformatted` removal.

## Agent Status + Handoff

### Agent 1 Status (Completed on February 13, 2026)

Completed:
- Updated `backend/src/api/schemas/incoming.py` to remove `ToolResultMetadata` and `payload.metadata` from `tool-result`.
- Added explicit `tool-result` data contract models:
  - `ToolResultSystemState` with required `active_window` and `mouse_position`.
  - `ToolResultData` with required `llm_content` and required `system_state`.
- Kept `tool-bundle-result` transport fields unchanged; added schema comment clarifying screenshot fields are conditional for computer-use bundles.

Validation run:
- `python -m compileall backend/src/api/schemas/incoming.py` passed.

No-op notes for Agent 1 owned frontend files:
- `frontend/src/renderer/types/backendEvents.ts`: no `tool-result` incoming payload contract definitions to change in this step.
- `frontend/src/types/schema.ts`: current generated file does not contain `tool-result` contract surface; no Agent 1 update applied.

### Handoff to Agent 2 (Frontend Payload + Capture)

- Frontend must now emit `tool-result.payload.data.system_state` with both required keys:
  - `active_window`
  - `mouse_position`
- Frontend must stop emitting `payload.metadata` and `data.is_preformatted`.
- Keep screenshot fields conditional: include only for computer-use tool results.

### Handoff to Agent 3 (Backend Receiver + Formatting)

- `ToolResultPayload.data` is now a typed object (`ToolResultData`) instead of a free dict.
- Update handler/receiver flow to consume typed payload safely (normalize via `model_dump()` before domain-layer dict paths, if needed).
- Remove metadata sanitizer and all `is_preformatted` branches.

### Handoff to Agent 4 (Tests)

- Update tests that assert:
  - `payload.metadata.is_preformatted`
  - `data.is_preformatted`
- Add/adjust schema assertions for required:
  - `data.system_state.active_window`
  - `data.system_state.mouse_position`

### Handoff to Agent 5 (Docs/Integration)

- Reflect that `tool-result` no longer carries metadata flags and now requires `system_state` keys.
- Keep bundle envelope docs intact, with screenshot conditional guidance only.

### Agent 2 Status (Completed on February 13, 2026)

Completed:
- Updated `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`:
  - removed `is_preformatted` emission from `tool-result` payload data.
  - enforced required `data.system_state` shape with fallback `"Unknown"` for missing `active_window`/`mouse_position`.
  - made `screenshot_ref` conditional via `includeScreenshot`; omitted for non-computer tools.
- Updated `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`:
  - gated screenshot artifact upload/reference to computer-use tools only.
  - passed normalized system state into `tool-result` payload creation.
  - preserved existing `llm_content` formatting path (frontend remains source of truth).
- Updated frontend tests:
  - `tests/frontend/ToolExecutionPayloads.test.ts`
  - `tests/frontend/ToolExecutionService.test.ts`
  - removed positive `is_preformatted` assertions.
  - added assertions for required `system_state` and non-computer screenshot omission.

Validation run:
- `npm --prefix frontend run test -- tests/frontend/ToolExecutionPayloads.test.ts tests/frontend/ToolExecutionService.test.ts` passed.

### Handoff to Agent 3 (Post-Agent-2 Delta)

- Backend can now rely on frontend `tool-result.payload.data` always containing:
  - `llm_content`
  - `system_state.active_window`
  - `system_state.mouse_position`
- Frontend no longer emits `is_preformatted` anywhere in tool-result payloads.
- `screenshot_ref` appears only for computer-use tool results; backend should not infer screenshot presence for non-computer tools.

### Handoff to Agent 4 (Post-Agent-2 Delta)

- Frontend expectations are now:
  - no `is_preformatted`.
  - required `data.system_state` keys in all `tool-result` payloads.
  - non-computer tool results omit `screenshot_ref`.

### Agent 3 Status (Completed on February 13, 2026)

Completed:
- Updated `backend/src/api/handlers/tool_result.py`:
  - removed metadata sanitizer path and deleted `_validate_metadata`.
  - added typed payload normalization (`_serialize_tool_result_data`) to convert `ToolResultData` models into plain dicts via `model_dump(exclude_none=True)` before domain-layer routing.
  - stopped reading `payload.metadata` and stopped forwarding metadata in `process_frontend_tool_result`.
- Updated `backend/src/agent/session/session.py`:
  - removed `metadata` parameter from `process_frontend_tool_result`.
- Updated `backend/src/agent/tools/waiting/handler.py`:
  - removed metadata normalization path and removed metadata from receiver call.
- Updated `backend/src/agent/tools/waiting/receiver.py`:
  - removed logic copying `data.is_preformatted` into metadata.
  - now builds `ToolResult` from `success/data/error` only for individual results.
- Updated `backend/src/core/interfaces/tool.py`:
  - simplified `ToolResult.format_for_history()`:
    - trust `llm_content` when present.
    - fallback to `Error: ...` when error exists.
    - fallback to data text (`output`, `message`, `llm_content`, or raw data string) when needed.
    - removed all `is_preformatted` branching.
- Updated `backend/src/agent/tools/processing/synthetic_factory.py`:
  - removed synthetic metadata flag injection (`metadata={"is_preformatted": True}`).

Validation run:
- `python -m compileall backend/src/api/handlers/tool_result.py backend/src/agent/tools/waiting/receiver.py backend/src/agent/tools/waiting/handler.py backend/src/agent/session/session.py backend/src/core/interfaces/tool.py backend/src/agent/tools/processing/synthetic_factory.py` passed.
- `./scripts/python-in-env backend pytest tests/backend/test_tool_result_receiver.py tests/backend/test_tool_result_formatting.py tests/backend/test_api_handlers.py -q` failed with expected contract-drift failures (tests still expecting old contract).

### Handoff to Agent 4 (Post-Agent-3 Delta)

- Update tests for removed metadata path:
  - remove direct calls passing `metadata=` into `ToolResultReceiver.receive_individual_result`.
  - remove/replace `ToolResultHandler._validate_metadata` assertions (method removed).
- Update API handler tests constructing `ToolResultMessage`:
  - `payload.data` must now include required `llm_content` and `system_state` with `active_window` + `mouse_position`.
- Known failing tests after Agent 3 changes:
  - `tests/backend/test_tool_result_receiver.py::test_receive_individual_result_sets_preformatted_metadata`
  - `tests/backend/test_api_handlers.py::test_tool_result_handler_routes_to_session`
  - `tests/backend/test_api_handlers.py::test_tool_result_handler_validate_metadata_filters_unknown_keys`
  - `tests/backend/test_api_handlers.py::test_tool_result_handler_missing_session_is_noop`

### Handoff to Agent 5 (Post-Agent-3 Delta)

- Backend runtime no longer supports/mentions `is_preformatted`; docs should remove this term from backend flow descriptions.
- Backend `tool-result` handler now normalizes typed `ToolResultData` via `model_dump(exclude_none=True)` before routing; if API docs describe handler behavior, align with this.
- History formatting behavior is now:
  - `llm_content` preferred.
  - error fallback.
  - data text fallback.
