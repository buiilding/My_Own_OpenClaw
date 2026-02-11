"""Session runtime state containers and access helpers."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from backend.src.agent.tools.preparation.screenshot.state import ScreenshotState
from backend.src.agent.tools.preparation.storage.resolved_call_storage import (
    ResolvedToolCallStorage,
)
from backend.src.agent.tools.waiting.storage.result_storage import ToolResultStorage


@dataclass(slots=True)
class SessionRuntimeState:
    """
    Runtime state for an active AgentSession.

    Centralizes mutable runtime objects so session logic can stay orchestration-focused.
    """

    screenshot: ScreenshotState = field(default_factory=ScreenshotState)
    resolved_calls: ResolvedToolCallStorage = field(default_factory=ResolvedToolCallStorage)
    tool_results: ToolResultStorage = field(
        default_factory=lambda: ToolResultStorage(cleanup_ttl_seconds=300)
    )
    system_state: Optional[Dict[str, Any]] = None
    ocr_completion_event: asyncio.Event = field(default_factory=asyncio.Event)

    def __post_init__(self) -> None:
        self.ocr_completion_event.set()

    def get_system_state(self) -> Optional[Dict[str, Any]]:
        """Return copy of current system state."""
        if not isinstance(self.system_state, dict):
            return None
        return dict(self.system_state)

    def set_system_state(self, payload: Optional[Dict[str, Any]]) -> None:
        """Set current system_state payload."""
        if payload is None:
            self.system_state = None
            return
        self.system_state = dict(payload)

    def clear(self) -> None:
        """Clear all runtime state."""
        self.screenshot.clear()
        self.resolved_calls.clear()
        self.tool_results.clear_all()
        self.system_state = None
        self.ocr_completion_event.set()
