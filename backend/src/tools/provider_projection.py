"""Provider-aware model-facing tool projection helpers."""

from __future__ import annotations

from typing import Any, Dict, List


def project_tool_schemas_for_provider(
    *,
    tool_schemas: List[Dict[str, Any]],
    tool_registry: Any | None,
    config: Any,
    prompt_messages: List[Dict[str, Any]] | None = None,
) -> List[Dict[str, Any]]:
    _ = tool_registry
    _ = config
    _ = prompt_messages
    return list(tool_schemas)
