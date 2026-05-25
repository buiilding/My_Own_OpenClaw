"""Provider-aware model-facing tool projection helpers."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.src.tools.tool_policy import ToolPolicy


def project_tool_schemas_for_provider(
    *,
    tool_schemas: List[Dict[str, Any]],
    tool_registry: Any | None,
    config: Any,
    prompt_messages: List[Dict[str, Any]] | None = None,
) -> List[Dict[str, Any]]:
    _ = tool_registry
    _ = prompt_messages
    return ToolPolicy.from_config(config).filter_tool_schemas(tool_schemas)
