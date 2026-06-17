"""Backend-owned remote tool catalog exposed to clients."""

from __future__ import annotations

from typing import Any

from backend.src.tools.web_search.capabilities import resolve_web_search_execution_mode


def build_remote_tool_catalog(config: Any) -> dict[str, list[dict[str, Any]]]:
    web_search_mode = resolve_web_search_execution_mode(config)
    web_search_available = web_search_mode in {"native-gemini", "backend-brave"}
    return {
        "remote_tools": [
            {
                "name": "web_search",
                "description": "Search the web through the hosted backend.",
                "enabled": web_search_available,
                "available": web_search_available,
                "reason_unavailable": (
                    None
                    if web_search_available
                    else "No native provider search mode or Brave fallback is available."
                ),
            }
        ]
    }
