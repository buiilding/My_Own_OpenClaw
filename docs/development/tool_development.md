---
summary: "Tool Development Guide"
read_when:
  - When creating or modifying tools.
---

# Tool Development Guide

## Overview

Model-facing tool calling is split across backend policy, the Agent SDK/local
runtime contract, and the desktop local-runtime executor:

- Agent SDK plus the desktop local-runtime host own model-facing schemas for
  client/local-runtime tools.
- Backend validates client-provided manifests, applies policy/provider
  projection, owns backend remote tools, and owns request correlation.
- The desktop local runtime executes local tools against the local machine
  through the current local-runtime Python implementation.

This guide documents the current tool API and registration flow.

For third-party or developer-owned local tools, start with
[Extension Convention](extensions.md#local-runtime-plugin-tool-registration).
Only use the backend SDK path below for backend-owned remote tools or
first-party built-in local tools.

## Runtime Ownership

### Backend (schema + orchestration)

- SDK base class: `backend/src/sdk/tool.py`
- Tool context: `backend/src/sdk/context.py`
- Remote tool stubs: `backend/src/tools/remote_tools/`
- Remote tool catalog: `backend/src/tools/tool_catalog.py`
- Contract test: `tests/backend/test_remote_tool_contract.py`

### Desktop local runtime (execution)

- Local-runtime tool registry implementation:
  `frontend/src/main/python/tools/registry.py`
- Local-runtime diagnostic schema export implementation:
  `frontend/src/main/python/tools/manifest.py`
- Local-runtime extension tool loader implementation:
  `frontend/src/main/python/tools/extension_loader.py`
- Client model-facing manifest builder:
  `frontend/src/main/extensions/tool_manifest.cjs`
- Extension manifest loader:
  `frontend/src/main/extensions/extension_manifest.cjs`
- Tool implementations: `frontend/src/main/python/tools/`
- Built-in local-runtime direct-tool set for backend parity:
  `frontend/src/main/python/tools/manifest.py` (`LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`)

Current runtime note:

- the live backend and local-runtime implementation registries expose direct
  tool names only
- the SDK/Electron agent host sends `agent_definition.tools.client_manifest`
  during websocket handshake so client/local-runtime tool schemas can be extended
  without editing backend schema code.
- local-runtime plugin tools put model-facing JSON Schema files under
  `plugins/<id>/schemas/` and reference them as `schema` from
  `plugins/<id>/plugin.json`
- local-runtime plugin tools put executable Python under
  `plugins/<id>/python/` and reference it as
  `entrypoint: "python/file.py:function"` from `plugin.json`
- local-runtime plugin and module entrypoints must return native
  `tools.result.ToolResult` values
- ordinary extensions do not edit the built-in local-runtime implementation
  registry or executable manifest modules
- repo-local `model-facing/tool_schema.txt` still documents unified `computer_use` and `system_use` envelopes, but those wrapper names are not current backend or local-runtime registry entries

## Current SDK Pattern

Use `Tool[ArgsModel]` with `args_model` and `run()`.

```python
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool


class ExampleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str = Field(..., description="Query text")


class ExampleTool(Tool[ExampleArgs]):
    name = "example_tool"
    description = "Describe exactly when the model should use this tool."
    args_model = ExampleArgs

    async def run(self, args: ExampleArgs, ctx: ToolContext) -> dict[str, Any]:
        return {
            "success": True,
            "output": f"Processed: {args.query}",
            "output": "Success",
        }
```

Notes:
- Do not implement `get_schema()` manually for SDK tools.
- Schema is built from `args_model` via Pydantic and normalized by the class-level `Tool.build_tool_spec()` path.

## Adding an LLM-Callable Remote Tool

### 1. Define args schema

Create/update the args model in the domain schema module, e.g.:
- `backend/src/tools/system/schemas.py`
- `backend/src/tools/filesystem/schemas.py`
- `backend/src/tools/computer/schemas.py`
- browser actions in `frontend/src/main/python/windie_shared/browser_contract*.py`

Use `ConfigDict(extra='forbid')` for strict payload validation.

### 2. Add backend remote stub

Create the stub in `backend/src/tools/remote_tools/<domain>.py`.

```python
from pydantic import BaseModel, ConfigDict, Field

from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool
from backend.src.tools.remote_tools.base import RemoteToolBase, RemoteToolResult


class MyRemoteToolArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(..., description="Example input")


class RemoteMyTool(RemoteToolBase, Tool[MyRemoteToolArgs]):
    name = "my_remote_tool"
    description = "Precise tool description for model selection."
    args_model = MyRemoteToolArgs

    async def execute_remote(
        self,
        args: MyRemoteToolArgs,
        ctx: ToolContext,
    ) -> RemoteToolResult:
        return self._build_remote_result(args, ctx)
```

### 3. Register backend stub

- Add the tool metadata entry in `backend/src/tools/tool_catalog.py`.
- Import remote tool implementations from their concrete modules; the
  `backend/src/tools/remote_tools/` package root has no compatibility export
  surface.

### 4. Implement local execution handler

For a built-in tool, create the local-runtime Python implementation in
`frontend/src/main/python/tools/...`.

```python
from typing import Any


async def execute_my_remote_tool(args: dict[str, Any]) -> dict[str, Any]:
    try:
        value = args.get("query", "")
        return {
            "success": True,
            "data": {
                "output": f"Handled query: {value}",
                "output": "Handled",
            },
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }
```

### 5. Register built-in local-runtime handler + exposure

For built-ins, update `frontend/src/main/python/tools/registry.py`:
- Add the tool to `TOOL_CATALOG` (or the explicit `switch_window` / `get_open_windows` registration path when appropriate).
- Add tool name to `frontend/src/main/python/tools/manifest.py` if it should be LLM-callable from the backend.

For plugin tools, do not edit built-in registry files. Add `schema` and the
Python `entrypoint` to `plugins/<id>/plugin.json`; Electron main
forwards the schema manifest and the local runtime loads the executable
entrypoint through the local-runtime Python implementation.
The entrypoint must return a native `tools.result.ToolResult`.
The plugin package must include:

```text
plugins/<id>/
  plugin.json
  schemas/<tool>.schema.json
  python/<tool>.py
```

For reusable instructions that do not execute code, add
`skills/<skill-id>/SKILL.md`; those skills become prompt layers, not
tools.
For protocol-backed tools, add `mcps/<id>/mcp.json` and let the MCP
runtime discover `tools/list`.

### 6. Validate drift contract

Run:

```bash
./scripts/python-in-env backend python -m pytest tests/backend/test_remote_tool_contract.py
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_shared_tool_schema_parity.py
```

Then run full suites relevant to your change:

```bash
<windie> test backend
<windie> test local-runtime
```

## Local Runtime Result Contract

Local-runtime handlers should return dictionary payloads that can be converted
to the canonical result shape.

Success:

```python
{
  "success": True,
  "data": {
    "output": "Model-facing summary",
    "output": "UI summary",
    "result": {"...": "..."}
  }
}
```

Failure:

```python
{
  "success": False,
  "error": "Actionable error message"
}
```

## Screenshot Behavior

For computer-use flows, post-action screenshot capture is orchestrated by the
Agent SDK tool coordinator and desktop local-runtime host after execution. You
do not enable this with a per-tool flag in schema code.

## Backend-Only Tools

The default runtime auto-registers remote tools for LLM calling and separately registers backend-owned tools in `backend/src/tools/registry.py` (`_register_backend_tools()`).

Current example:

- `web_search` is backend-owned and does not participate in local-runtime executable parity tests.

If you add backend-only tools, document the wiring point in the same PR.

## Troubleshooting

### Tool not visible to model

1. For backend-owned tools, confirm backend stub is present in
   `backend/src/tools/tool_catalog.py` and the concrete
   `backend/src/tools/remote_tools/<domain>.py` module.
2. For built-in local-runtime executable tools, confirm the tool is listed in
   `frontend/src/main/python/tools/manifest.py`, the current local-runtime Python
   implementation manifest.
3. For local-runtime plugin tools, confirm `plugin.json` has `schema` and
   `entrypoint`.
4. Confirm the handler is registered in the local-runtime executable registry
   (`frontend/src/main/python/tools/registry.py`).
5. Run remote contract or extension manifest tests for the changed path.

### Tool executes but fails in local runtime

1. Verify args model and local-runtime argument parsing match.
2. Return structured `success/error` payloads.
3. Check local-runtime Python stderr logs and `tests/sidecar` coverage.

---

See also:
- [Tool System](../architecture/tool_system.md)
- [Local-Runtime Python Implementation](../architecture/python_sidecar.md)
- [API Reference](../reference/api_reference.md)
