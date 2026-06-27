---
summary: "Tool System"
read_when:
  - When changing tool registry or execution.
---

# Tool System

## Overview

The Tool System enables WindieOS to interact with the computer through a set of specialized tools. Most tools are dispatched through the SDK/main local runtime into the local-runtime Python executor, while backend-owned tools such as `web_search` execute entirely in backend Python.

Current runtime note:

- the live backend registry and the live local-runtime registry both use direct tool names such as `mouse_control` and `run_shell_command`
- the repo also contains wrapper-shaped reference artifacts for `computer_use` and `system_use` under `model-facing/`, but those names are not registered by `backend/src/tools/registry.py` or `frontend/src/main/python/tools/registry.py`

Client/local-runtime built-in tool schemas now flow through `client_tool_manifest`.
For the decision history, see `docs/adr/005-frontend-tool-schema-source-of-truth.md`.

## Architecture

```
+--------------------------------------------------+
| Backend (Python)                                 |
|  - ToolRegistry: registration and schema cache   |
|  - ToolResultOrchestrator: result assembly       |
|  - ToolPreparer: screenshots/OCR/coordinates     |
+--------------------------------------------------+
                 ^ WebSocket
                 |
+--------------------------------------------------+
| Client Manifest + Local Runtime                  |
|  - Electron main: host bridge and dispatch       |
|  - SDK runtime: ToolExecutionCoordinator         |
|  - Local-runtime Python executor: executable tools |
|  - Renderer: result projections and display      |
+--------------------------------------------------+
```

## Tool Types

### Remote Tools (Local-Runtime Execution)

Most tools are dispatched through the SDK/main local runtime into the local-runtime Python executor:

- **Computer Control Tools**: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`
- **System/Filesystem Tools**: `run_shell_command`, `replace`, `read_file`, `get_system_stats`, `get_open_windows`
- **Additional System Tools**: `open_app`, `process`
- **Browser Tools**: `browser`

This is the live remote tool surface today: 14 direct remote tools shared across the backend catalog and local-runtime exposed-tool set.

Catalog-driven declaration contract:

- backend `backend/src/tools/tool_catalog.py` is the source of truth for backend-owned remote tools and backend policy
- Electron client manifest builder `frontend/src/main/extensions/tool_manifest.cjs` is the source of truth for built-in client/local-runtime schemas
- plugin `schema` contributions are loaded by Electron main from `plugins/*/plugin.json`
- plugin Python entrypoints are loaded by the local-runtime Python implementation from `plugins/*/plugin.json`
- backend validates accepted/rejected client manifest entries before prompt construction
- backend `tool_catalog.py` now builds canonical tool specs and remote stub classes together through one builder path; `ToolRegistry` consumes those prebuilt specs instead of deriving schemas from live tool instances
- model visibility, declaration assembly, and runtime lookup all project from the same registered tool names
- prompt-time filtering, parser whitelists, transparency payloads, and local-runtime exposed-tool parity all consume the same direct tool names
- typed agent capability policy can narrow the model-visible tool surface per effective user/session config without rebuilding the registry or restarting the backend
- agent capability selection prunes tool names, fields, enums/defaults, and conditional branches without rewriting descriptions
- browser now uses the same generic schema generation path as every other backend-exposed tool; there is no browser-only schema rewriter
- provider adapters still convert the internal flat tool spec into transport-specific formats when needed; that transport adaptation remains the main remaining schema-transformation drift risk
- OpenAI now receives the same direct desktop function tools (`mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `wait`) as the canonical internal contract; provider-native adaptation is limited to features that remain intentionally native, such as OpenAI web search
- grouped tools such as `browser` must emit provider-safe root-object schemas directly; OpenAI compatibility should not depend on browser-specific post-hoc schema rewrites

Boundary rule:

- Client and local-runtime Python code must never import backend Python modules or depend on `backend.src.*` at runtime
- client/local-runtime and backend schema pairing must stay import-independent across that boundary
- drift prevention comes from explicit backend-vs-local-runtime schema parity tests run before production, not from cross-boundary runtime imports

Wrapper reference artifact note:

- `model-facing/tool_schema.txt` still contains unified `computer_use` and `system_use` envelope schemas
- current runtime does not load those wrapper schemas into `ToolRegistry`; `backend/src/llm/prompts/prompts.py` loads `backend/src/llm/prompts/system_prompt.txt`, and the live tool declarations come from `backend/src/tools/tool_catalog.py` plus backend-registered tools such as `web_search`

### Backend-Executed Tools

Some logical tools are fulfilled entirely in the backend and never go through the local runtime. Current v1 support is `web_search`, but the execution path now depends on provider:

- OpenAI-capable sessions do not expose backend `web_search` to the model. Instead, the main OpenAI Responses request includes native `web_search` directly, so the same agent turn performs the search without a second backend-owned LLM sub-call.
- Gemini and Brave-backed sessions still expose logical backend `web_search`: the model emits a tool call, the backend fulfills it, and the UI renders the final tool-output result.
- Brave remains the backend fallback when `BRAVE_SEARCH_API_KEY` is configured for providers without native search.
- OpenAI native `web_search` still streams lightweight progress rows
  (`web-search-progress` -> SDK `tool_progress` -> overlay/dashboard search
  trace), but those progress events come from the main LLM turn rather than a
  backend logical tool execution. They are retained as display transparency but
  are not followed by backend `tool-call`/`tool-output` rows for the same
  search. During SDK rehydrate, progress-only native search is normalized into a
  synthetic SDK-normalized `web_search` `tool_call`/`tool_output` pair; these
  rows are SDK-normalized history, not OpenAI-emitted function tool outputs.

### Backend Responsibilities

The backend:
- Builds tool schemas and passes them to LiteLLM via native request params (`tools`, optional `tool_choice`, optional `parallel_tool_calls`)
- Emits tool schemas as a transparency event (`tool-schemas`)
- Resolves coordinates and screenshots with frame-local metadata (`capture_meta` + internal frame identity)
- Waits for results from SDK/main local-runtime execution for client/local-runtime tools
- Executes backend-owned tools directly when a tool declares backend execution
- Augments provider-native web-search responses with normalized source/progress metadata
- Keeps tool schemas focused on action/parameter contracts while placing cross-tool operational strategy (grounding, timing, verification, sequencing) in the global system prompt

Current live model-facing tool count:

- 14 direct remote tools from `backend/src/tools/tool_catalog.py`
- optional backend-owned logical `web_search` for Gemini/Brave-backed sessions
- OpenAI sessions expose the same 14 live runtime tool schemas as the canonical backend registry and add provider-native `web_search` directly at the OpenAI transport layer
- effective per-session agent policy may expose fewer tools or fewer coordinate methods than the registered catalog contains

OpenAI desktop tool note:

- The provider-facing tool list matches the canonical registry list for desktop tools on every query.
- Non-OpenAI providers continue to see the same direct internal tool names unchanged.

## Tool Execution Flow

### 1. Tool Call Generation

LLM returns structured tool calls from the API response object (native tool-calling):

```json
{
  "id": "chatcmpl-...",
  "choices": [
    {
      "message": {
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "run_shell_command",
              "arguments": "{\"command\":\"pwd\",\"run_in_background\":false,\"explanation\":\"check current workspace\"}"
            }
          }
        ]
      }
    }
  ]
}
```

### 2. Tool Preparation

**ToolPreparer** (`agent/tools/preparation/preparer.py`) prepares tool calls:

1. **Screenshot Acquisition**: Ensures screenshot is available
2. **OCR Processing**: Runs OCR if needed for coordinate resolution
3. **Coordinate Resolution**: Resolves coordinates using OCR or vision models
4. **Tool Call Preparation**: Adds metadata and coordinates

Pre-dispatch model-shape validation notes:
- backend argument validation applies to backend-executed tools only
- local-executed payload shape is validated by the local-runtime execution path
- backend preparation may still strip backend-only grounded fields before local dispatch

Schema pairing rule:

- backend fallback/tool-policy schemas and local-runtime executable schemas are paired contracts, not shared runtime ownership
- when a local tool contract changes, the client manifest and local-runtime schema must both be updated and parity-tested before release
- parity tests are the safety mechanism that catches drift without breaking backend/client runtime boundaries

Execution identity provenance:
- `request_id`/`bundle_id`: generated by backend during preparation for result correlation.
- `metadata.tool_call_id`: forwarded from provider/LLM tool-call payload `id` when present; backend synthesizes `tool_call_<index>` if missing.

Direct tool contract before execution:

- model-facing tool names are already the execution-facing tool names
- no wrapper-envelope normalization happens in parser, registry, or local-runtime routing
- each backend-executed direct tool validates through its backend schema; each local-executed direct tool validates in the local runtime
- unified `computer_use` and `system_use` wrapper names remain repo-local reference artifacts, not registered runtime tool names

### 3. Tool Execution

Tool calls are sent by the agent tool sender. Execution now has two lanes:

- Local-runtime lane: the backend emits a `tool-call` or `tool-bundle` event and SDK/main dispatches execution through the local runtime.
- Backend lane: the backend validates args, creates tool context, executes the tool immediately, can optionally emit auxiliary progress events mid-run, then emits the corresponding `tool-output`.

**ToolResultOrchestrator** (`tools/orchestrator.py`) waits for local-runtime results and assembles `ToolResult` objects:

1. SDK runtime receives and normalizes the backend `tool-call` or `tool-bundle`.
2. `ToolExecutionCoordinator` claims executable local events and calls the SDK local-runtime client.
3. SDK local runtime routes the local call to the local-runtime Python tool bridge, with Electron main supplying host context.
4. The local-runtime Python implementation executes the tool, including screenshot/system-state capture when required by the executable tool.
5. SDK runtime sends exactly one `tool-result` or `tool-bundle-result` back to backend and appends the normalized tool output event for display/projection.

Backend lane additions:

1. The sender resolves the tool implementation from the backend registry
2. Backend-executed tools run without local-runtime dispatch
3. Results are staged directly in session pending-results storage
4. Tool-output history continues through the normal orchestration path

### 4. Result Processing

**ToolResultHandler** (`agent/tools/waiting/handler.py`) processes results:

1. Receives SDK/local-runtime tool result payload
2. Stores result in centralized **ToolResultStorage** (with TTL-based cleanup)
3. Processes screenshot and OCR
4. Updates conversation history (O(1) access via cached LLM format)
5. Continues agent interaction

## Tool Development

Computer-control ownership notes:

- `mouse_control` covers click, double-click, right-click, move, and drag only.
- `scroll_control` is the sole scroll contract.
- `scroll_control` vertical actions (`scroll_up`/`scroll_down`) default to an executor-owned click amount; optional `clicks` remains available as an explicit literal override.
- Drag execution still uses `x/y` as source and `drag_to_x/drag_to_y` as destination.

### SDK Tool Base Class

All tools inherit from `Tool` base class (`sdk/tool.py`) and define an
`args_model` plus `run()` implementation:

```python
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext


class MyToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    param1: str = Field(..., description="Parameter 1")


class MyTool(Tool[MyToolArgs]):
    name = "my_tool"
    description = "Description of my tool"
    args_model = MyToolArgs

    async def run(self, args: MyToolArgs, ctx: ToolContext) -> dict[str, Any]:
        return {
            "success": True,
            "output": f"Tool executed: {args.param1}",
        }
```

### Client/Local-Runtime Tool (Local-Runtime Execution)

Client/local-runtime tools use backend catalog stubs for model-facing schema and
policy, then dispatch executable payloads through the SDK/main local runtime
into the local-runtime Python executor. Backend-owned remote tools such as `web_search`
stay in backend services and do not use the local-runtime Python executor.

**Backend Catalog Stub** (`backend/src/tools/remote_tools/<domain>.py`, a
historical package name for local-runtime-executed catalog entries):

```python
from pydantic import BaseModel, ConfigDict

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult

class MyRemoteToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    param1: str

class MyRemoteTool(Tool[MyRemoteToolArgs], RemoteToolBase):
    name = "my_remote_tool"
    description = "Description of my remote tool"
    args_model = MyRemoteToolArgs

    async def execute_remote(
        self,
        args: MyRemoteToolArgs,
        ctx: ToolContext,
    ) -> RemoteToolResult:
        return self._build_remote_result(args, ctx)
```

**Local-Runtime Implementation** (`frontend/src/main/python/tools/<domain>/<tool>_tool.py`, registered via `frontend/src/main/python/tools/registry.py`):

```python
from typing import Any, Dict

async def execute_my_tool(args: Dict[str, Any]) -> Dict[str, Any]:
    # Tool execution logic
    return {
        "success": True,
        "data": {
            "output": "Tool executed successfully",
            "output": "Success"
        }
    }
```

### Tool Registration

Tools are automatically registered:

1. **Backend remote stubs**: Declared once in `backend/src/tools/tool_catalog.py`, implemented in concrete `backend/src/tools/remote_tools/*` modules, and instantiated by `backend/src/tools/registry.py`.
2. **Built-in local-runtime executors**: Registered in `frontend/src/main/python/tools/registry.py` and backed by the local-runtime Python implementation.
3. **Plugin local-runtime executors**: Declared with `entrypoint` in `plugins/<id>/plugin.json` and loaded by `frontend/src/main/python/tools/extension_loader.py`.
4. **LLM-callable built-in local-runtime subset**: Explicitly declared in `frontend/src/main/python/tools/manifest.py` as `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`.
5. **Backend-only tools**: Explicitly wired in `backend/src/tools/registry.py:_register_backend_tools()` or marked non-client-executable in `backend/src/tools/tool_catalog.py`.
   - `web_search` is the current backend-owned logical tool and can be fulfilled either by provider-native search or a backend Brave Search fallback.
   - `grounded_mouse_action` and `grounded_scroll_action` are model-visible
     helper tools that backend preparation rewrites to local-runtime executable
     `mouse_control` and `scroll_control` calls; they must not appear in the
     local-runtime executable manifest.

## Coordinate Resolution

### OCR-Based Resolution

For tools requiring coordinate resolution via OCR:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "ocr",
        "ocr_text": "Submit Button"
    }
}
```

**Flow**:
1. Screenshot captured
2. OCR runs on screenshot
3. Text searched in OCR results
4. Coordinates extracted
5. Tool call prepared with coordinates

If multiple OCR rows match the target text above the configured similarity threshold,
resolution fails with an ambiguity error that lists candidate ids and candidate `(x, y)` positions.
The agent must retry using OCR candidate selection only:
- `find_coordinates_by="ocr"` + `candidate_id`.
- Ambiguity output also includes a structured JSON payload (`ambiguity_payload_json`) with candidate list for deterministic copy-through.

If no OCR row meets threshold, resolution now returns the top 3 fuzzy candidates
(with `candidate_id`, score, coordinates when available) and the same
`ambiguity_payload_json` shape so retries can still pick a deterministic candidate.

All grounding coordinates are interpreted as screenshot pixel coordinates and normalized once to desktop coordinates using `capture_meta` from the same frame.

### Vision-Based Resolution

For tools using vision models:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "prediction",
        "source_description": "Submit button"
    }
}
```

**Flow**:
1. Screenshot captured
2. Vision model analyzes screenshot
3. Element detected and localized
4. Coordinates extracted
5. Tool call prepared with coordinates

## Screenshot Management

### Screenshot Lifecycle

1. **User Message**: Screenshot captured before sending (via useChatMessageSender) and uploaded via HTTP `/api/artifacts`
2. **Tool Execution**: Screenshot automatically captured after computer-use tool execution in the local-runtime path backed by local-runtime Python modules and uploaded via HTTP `/api/artifacts`
   - **Individual Tools**: Screenshot captured **once** after tool execution completes
   - **Bundled Tools**: Screenshot captured **once** after all bundled tools execute (not after each tool)
   - Individual tools use `ensureAutoCapture(...)` for shared capture policy and fallback behavior.
   - Bundles use the shared bundle capture path (one capture per bundle when computer-use actions are present).
   - Default wait is 2 seconds for most computer-use tools, 0 for `screenshot`, and may be overridden by tool args (`wait`/`seconds`).
3. **WS Reference + Metadata**: WebSocket payloads carry `screenshot_ref` (no base64 blobs) plus `capture_meta`
4. **OCR Processing**: Screenshot processed for OCR (backend, resolved from artifact store)
5. **Storage**: Screenshot stored in session with unique ID (backend)

### ScreenshotManager

**ScreenshotManager** (`agent/tools/screenshot_manager.py`) manages screenshots:

- **get_screenshot()**: Ensure an active screenshot is available in session
- **process_screenshot()**: Process and store screenshot, trigger OCR
- **Screenshot IDs + Capture Metadata**: Frame IDs and capture metadata prevent stale clicks and ensure deterministic screenshot_px -> desktop_px mapping

## Tool Schemas

**Note**: Tool schemas are passed as native LLM API tool params (`tools`) and are not embedded in user-message content.

### Schema Format

Tool schemas use canonical OpenAI/LiteLLM `tools[]` objects:

```json
{
  "type": "function",
  "function": {
    "name": "mouse_control",
    "description": "Control mouse actions",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["click", "double_click", "right_click"],
          "description": "Mouse action to perform"
        },
        "explanation": {
          "type": "string",
          "description": "Why this tool call is needed and how it advances the goal"
        },
        "x": {
          "type": "integer",
          "description": "X coordinate"
        },
        "y": {
          "type": "integer",
          "description": "Y coordinate"
        }
      },
      "required": ["action", "explanation"]
    }
  }
}
```

Legacy top-level shape (`{name, description, parameters}`) is deprecated/removed for runtime-critical flows.
No dual-shape fallback is supported in provider transport.

### Schema Registry

**SchemaRegistry** (`tools/schema_registry.py`) manages tool-schema caching:

- Validates canonical prebuilt tool specs
- Caches schemas for LLM native tool params and transparency emission
- Does not own schema shaping or tool-spec assembly

## Built-in Tools

### Computer Control Tools

- **mouse_control**: Mouse actions (click, drag, move). Source grounding supports `manual`, `ocr`, or `prediction` using `source_description` for prediction. Drag destinations support the same modes via `drag_to_find_coordinates_by` plus destination-specific fields (`drag_to_x/drag_to_y`, `drag_to_ocr_text`/`drag_to_candidate_id`, `destination_description`). Backend resolves both source and drag destination against the same current screenshot frame, then normalizes both into desktop coordinates before local execution.
- **keyboard_control**: Keyboard input
- **scroll_control**: Scroll actions. Supports `manual`, `ocr`, and `prediction` grounding at the backend preparation layer, then rewrites to concrete `x/y` before local execution. The local executor still consumes manual coordinates only after preparation resolves the target region.
- **screenshot**: Capture screenshot
- **switch_window**: Switch between windows
- **wait**: Pause for a specified duration

### File System Tools

- **read_file**: Read file contents
- **replace**: Replace text in a file through `replacements` or `patch_chunks`

These tools are exposed to the LLM directly as individual function tools.
Direct computer tools and selected system/filesystem tools carry their own
top-level `explanation` field when required by that tool's schema.

`read_file` behavior:
- Reads file content as line slices with `offset` (0-based) and `limit`.
- Defaults to `offset=0`, `limit=2000` when omitted.
- Truncates each returned line to 500 characters to keep outputs bounded.
- Uses a line/character budget (not a direct token cap): at defaults, worst-case content is about 1,000,000 characters (2000 * ~500 chars/line), which is roughly ~250,000 tokens using a 4 chars/token approximation.
- Typical code/text files are usually much lower than the worst case, but still large enough that paging with `offset` is recommended.
- For large files, use follow-up calls with increasing `offset` values to page through content.

`replace` matching behavior:
- First attempts exact text replacement after normalizing line endings (`\r\n`/`\r` -> `\n`).
- Supports `match_mode`:
  - `strict`: exact-only matching.
  - `lenient`: exact first, then line-sequence fallback with progressively lenient comparison (exact, trailing-space-insensitive, trim-insensitive, Unicode punctuation normalization). Context constraints (`before_context`/`after_context`) also use lenient matching.
- Supports contextual targeting with `before_context`, `after_context`, `occurrence_index` (1-based), and `require_eof`.
- Supports atomic batch edits via `replacements: [...]`; either all operations apply or no file write occurs.
- Supports apply_patch-style structured updates via `patch_chunks: [...]` with ordered chunk application (`change_context`, `old_lines`, `new_lines`, `is_end_of_file`) for robust multi-region edits.
- Returns structured edit metadata including `matched_spans`, per-operation details, and `unified_diff`.
- Allows `old_string=""` only for new-file creation (existing-file edits must provide a non-empty match string).

### System Tools

- **get_system_stats**: System statistics
- **get_open_windows**: List open windows
- **open_app**: Launch GUI app as a detached desktop process with optional window/screenshot verification
- **run_shell_command**: Execute shell command (supports `yield_after_seconds` + `env` overrides; omitted or relative `directory` values resolve from the selected workspace folder when configured and otherwise from the user home directory; repository/log search should prefer `rg` and exclude generated dependency, build-artifact, packaged-runtime, and VCS directories unless explicitly needed; use `process` for background sessions and high-volume output)
- **read_file**: Read text, PDF, or image files (relative `file_path` values resolve from the selected workspace folder when available and otherwise from the user home directory)
- **replace**: Modify text files atomically (relative `file_path` values resolve from the selected workspace folder when available and otherwise from the user home directory)
- **process**: Manage background shell sessions (poll/log/write/kill)

### Browser Tools

- **browser**: Browser automation and extraction tool (connect/navigation/snapshot/actions/extract); see `docs/browser/browser_control.md` and `docs/browser/browser_control_run.md` for full action contracts and runbook usage.
- The model-facing `browser` schema is emitted from one canonical backend action catalog. It stays grouped under `arguments.action`, exposes one root object with merged canonical action fields, and relies on runtime discriminated-union validation to enforce action-specific requirements without top-level schema combinators.

**Note**: The backend advertises a fixed set of remote tool schemas (LLM-callable). The local runtime may register additional helpers, but only tools listed in `frontend/src/main/python/tools/manifest.py` `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES` are available for LLM tool calling.

## Security

### Tool Execution Security

- **Permission Model**: `SecurityPolicy` defines permissions, but local execution does not enforce them yet
- **Sandboxing**: No executor abstraction is exposed; add a concrete isolated execution boundary only with an implemented strategy
- **Resource Limits**: Limits are defined in `SecurityPolicy`, not enforced in the local-runtime Python implementation by default
- **Audit Logging**: Policy supports audit logs; wire-in is required for enforcement

### Tool Validation

- **Schema Validation**: Tool arguments validated against schema
- **Type Checking**: Argument types validated
- **Required Fields**: Required fields checked
- **Range Validation**: Numeric ranges validated

## Performance

### Optimization Strategies

- **Parallel Execution**: Multiple tools in parallel
- **Caching**: Tool schemas cached
- **Batch Processing**: Batch coordinate resolution
- **Lazy Loading**: Tools loaded on demand

### Resource Management

- **Thread Pool**: Global thread pool for blocking operations
- **Memory Management**: Screenshot cleanup
- **Timeout Handling**: Tool execution timeouts

## Testing

### Tool Testing

Tools can be tested independently:

```python
import pytest

@pytest.mark.asyncio
async def test_my_tool():
    tool = MyTool()
    args = MyToolArgs(param1="value")
    result = await tool.run(args, ToolContext(...))
    assert result["success"] is True
```

### Integration Testing

Tool execution flow tested end-to-end:

```python
async def test_tool_execution_flow():
    # Test tool call generation
    # Test tool preparation
    # Test tool execution
    # Test result processing
```

## Extension Points

### Custom Tool Development

1. Create tool class inheriting from `Tool`
2. Define a Pydantic `args_model`
3. Implement `run()` (or `execute_remote()` for remote stubs)
4. Register tool in registry

### Tool Registration

1. Create tool class inheriting from `Tool`
2. Add the remote stub entry in `backend/src/tools/tool_catalog.py`
3. Add built-in local-runtime implementation plus local-runtime executable registry wiring, or add a
   plugin Python entrypoint in `plugins/<id>/plugin.json`
4. Keep `frontend/src/main/python/tools/manifest.py` in sync for
   LLM-callable built-in tools

---

For more detailed information, see:
- [Tool Development Guide](../development/tool_development.md)
- [API Reference](../reference/api_reference.md)
- Backend Architecture (private backend docs)
