"""Provider-aware model-facing tool projection helpers."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.src.tools.tool_policy import ToolPolicy


def project_tool_schemas_for_provider(
    *,
    tool_schemas: List[Dict[str, Any]],
    config: Any,
) -> List[Dict[str, Any]]:
    return ToolPolicy.from_config(config).filter_tool_schemas(tool_schemas)
