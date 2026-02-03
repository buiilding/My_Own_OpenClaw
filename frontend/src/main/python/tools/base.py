"""
Lightweight base classes for frontend tools.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional


class FrontendTool:
    """
    Minimal tool interface used by the local backend.
    """

    name: str = ""
    description: str = ""

    async def initialize(self) -> bool:
        return True

    async def run(self, args: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

    async def close(self) -> None:
        return None


@dataclass
class SimpleToolResult:
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"success": self.success}
        if self.data is not None:
            payload["data"] = self.data
        if self.error:
            payload["error"] = self.error
        return payload

    @classmethod
    def success(cls, data: Optional[Dict[str, Any]] = None) -> "SimpleToolResult":
        return cls(success=True, data=data or {})

    @classmethod
    def failure(cls, error: str) -> "SimpleToolResult":
        return cls(success=False, error=error)
