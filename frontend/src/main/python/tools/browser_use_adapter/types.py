"""Shared adapter result types for Browser Use compatibility routing."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

MigrationDecision = Literal["port", "compat", "deprecate"]


@dataclass(slots=True)
class AdapterActionResult:
    """Normalized adapter action result consumed by browser_tool."""

    success: bool
    action: str
    decision: MigrationDecision
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    warnings: list[str] = field(default_factory=list)
    deprecation: str | None = None

