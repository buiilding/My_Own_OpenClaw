"""Execution reference types for prepared tool calls."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional


ExecutionKind = Literal["single", "bundle"]


@dataclass(frozen=True, slots=True)
class ExecutionRef:
    """
    Stable execution identifier for prepared tool calls.

    - `single` calls carry `request_id`
    - `bundle` calls carry `bundle_id`
    """

    kind: ExecutionKind
    request_id: Optional[str] = None
    bundle_id: Optional[str] = None

    @classmethod
    def single(cls, request_id: str) -> "ExecutionRef":
        return cls(kind="single", request_id=request_id)

    @classmethod
    def bundle(cls, bundle_id: str) -> "ExecutionRef":
        return cls(kind="bundle", bundle_id=bundle_id)

    @classmethod
    def from_metadata(cls, metadata: Optional[Dict[str, Any]]) -> Optional["ExecutionRef"]:
        if not isinstance(metadata, dict):
            return None

        request_id = metadata.get("request_id")
        if isinstance(request_id, str) and request_id:
            return cls.single(request_id)

        bundle_id = metadata.get("bundle_id")
        if isinstance(bundle_id, str) and bundle_id:
            return cls.bundle(bundle_id)

        return None

    @property
    def correlation_id(self) -> str:
        return self.request_id if self.kind == "single" else self.bundle_id  # type: ignore[return-value]

    def apply_to_metadata(self, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        result = dict(metadata or {})
        if self.kind == "single" and self.request_id:
            result["request_id"] = self.request_id
            result.pop("bundle_id", None)
        elif self.kind == "bundle" and self.bundle_id:
            result["bundle_id"] = self.bundle_id
            result.pop("request_id", None)
        return result
