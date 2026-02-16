---
summary: "Tool Development Guide"
read_when:
  - When creating or modifying tools.
---

# Tool Development Guide

## Overview

WindieOS tool calling is split across backend and frontend sidecar:

- Backend owns tool schemas, tool selection, and request correlation.
- Frontend Python sidecar executes remote tools against the local machine.

This guide documents the current tool API and registration flow.

## Runtime Ownership

### Backend (schema + orchestration)

- SDK base class: `backend/src/sdk/tool.py`
- Tool context: `backend/src/sdk/context.py`
- Remote tool stubs: `backend/src/tools/remote_tools/`
- Remote tool registry: `backend/src/tools/remote_tools/registry.py`
- Backend-facing re-export: `backend/src/tools/remote.py`
- Contract test: `tests/backend/test_remote_tool_contract.py`

### Frontend sidecar (execution)

- Sidecar tool registry: `frontend/src/main/python/tools/registry.py`
- Tool implementations: `frontend/src/main/python/tools/`
- LLM-callable sidecar tool allowlist:
  `frontend/src/main/python/tools/registry.py` (`EXPOSED_TO_BACKEND_TOOLS`)

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
            "llm_content": f"Processed: {args.query}",
            "return_display": "Success",
        }
```

Notes:
- Do not implement `get_schema()` manually for SDK tools.
- Schema is generated from `args_model` via Pydantic and normalized by `Tool.get_json_schema()`.

## Adding an LLM-Callable Remote Tool

### 1. Define args schema

Create/update the args model in the domain schema module, e.g.:
- `backend/src/tools/system/schemas.py`
- `backend/src/tools/filesystem/schemas.py`
- `backend/src/tools/computer/schemas.py`
- `backend/src/tools/browser/schemas.py`

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

- Add the tool class in `backend/src/tools/remote_tools/registry.py` (`REMOTE_TOOLS`).
- Export from the package (`backend/src/tools/remote_tools/__init__.py`) if needed.

### 4. Implement sidecar execution handler

Create sidecar implementation in `frontend/src/main/python/tools/...`.

```python
from typing import Any


async def execute_my_remote_tool(args: dict[str, Any]) -> dict[str, Any]:
    try:
        value = args.get("query", "")
        return {
            "success": True,
            "data": {
                "llm_content": f"Handled query: {value}",
                "return_display": "Handled",
            },
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }
```

### 5. Register sidecar handler + exposure

In `frontend/src/main/python/tools/registry.py`:
- Register function in `ToolRegistry._register_tools()`.
- Add tool name to `EXPOSED_TO_BACKEND_TOOLS` if it should be LLM-callable.

### 6. Validate drift contract

Run:

```bash
./scripts/python-in-env backend python -m pytest tests/backend/test_remote_tool_contract.py
```

Then run full suites relevant to your change:

```bash
./scripts/test-backend
./scripts/test-sidecar
```

## Sidecar Result Contract

Sidecar handlers should return dictionary payloads that can be converted to the canonical result shape.

Success:

```python
{
  "success": True,
  "data": {
    "llm_content": "Model-facing summary",
    "return_display": "UI summary",
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

For computer-use flows, screenshot capture is orchestrated by frontend runtime services after execution. You do not enable this with a per-tool flag in schema code.

## Backend-Only Tools

The default runtime currently auto-registers remote tools for LLM calling. Backend-only tools are possible, but require explicit wiring where `ToolRegistry` is constructed/initialized and `register_tool()` is called.

If you add backend-only tools, document the wiring point in the same PR.

## Troubleshooting

### Tool not visible to model

1. Confirm backend stub is in `REMOTE_TOOLS`.
2. Confirm sidecar tool is listed in `EXPOSED_TO_BACKEND_TOOLS`.
3. Confirm handler is registered in sidecar `ToolRegistry`.
4. Run remote contract test.

### Tool executes but fails in sidecar

1. Verify args model and sidecar arg parsing match.
2. Return structured `success/error` payloads.
3. Check sidecar stderr logs and `tests/sidecar` coverage.

---

See also:
- [Tool System](TOOL_SYSTEM.md)
- [Python Sidecar](PYTHON_SIDECAR.md)
- [API Reference](API_REFERENCE.md)
