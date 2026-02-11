"""
Shared base types for frontend-executed remote tools.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from backend.src.core.security.policy import Permission
from backend.src.sdk.context import ToolContext

logger = logging.getLogger(__name__)


class RemoteToolResult:
    """
    Result wrapper indicating execution must happen on the frontend.
    """

    def __init__(self, tool_name: str, args: Dict[str, Any], request_id: str):
        self.tool_name = tool_name
        self.args = args
        self.request_id = request_id
        self.is_remote = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "args": self.args,
            "request_id": self.request_id,
            "is_remote": True,
        }


class RemoteToolBase:
    """
    Base mixin for tools that only provide schema/validation in backend.
    """

    required_permissions: set[Permission] = set()

    def _get_request_id(self, ctx: ToolContext) -> str:
        if ctx.session and ctx.session.metadata:
            request_id = ctx.session.metadata.get("request_id")
            if request_id:
                logger.debug("Using request_id from session metadata: %s", request_id)
                return request_id
        request_id = str(uuid.uuid4())
        logger.debug("Generated new request_id: %s", request_id)
        return request_id

    async def execute_remote(self, args: Any, ctx: ToolContext) -> RemoteToolResult:
        raise NotImplementedError("Subclasses must implement execute_remote")

    async def run(self, args: Any, ctx: ToolContext) -> RemoteToolResult:
        return await self.execute_remote(args, ctx)

    def _build_remote_result(
        self,
        args: Any,
        ctx: ToolContext,
        *,
        log_message: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> RemoteToolResult:
        request_id = request_id or self._get_request_id(ctx)
        if log_message:
            logger.debug(log_message)
        return RemoteToolResult(
            tool_name=self.name,
            args=args.model_dump(),
            request_id=request_id,
        )
