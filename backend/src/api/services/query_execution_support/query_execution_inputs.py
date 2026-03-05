"""Query payload input shaping helpers for query execution service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, List, Optional, Type, Union

from backend.src.api.services.query_execution_support.query_execution_runtime import (
    resolve_query_screenshot_metadata,
    resolve_screenshots,
)
from backend.src.services.artifacts import ArtifactStore

if TYPE_CHECKING:
    from backend.src.api.schema import QueryMessage


@dataclass(frozen=True)
class QueryExecutionInputs:
    """Normalized query inputs forwarded to agent_instance.process_query."""

    image_data: Optional[Union[str, List[str]]]
    capture_meta: Optional[dict[str, Any]]
    message_content: Optional[Any]
    conversation_ref: Optional[str]


def build_query_image_data(
    resolved_screenshots: Optional[List[str]],
) -> Optional[Union[str, List[str]]]:
    """Convert screenshot list into process_query-compatible image_data shape."""
    if not resolved_screenshots:
        return None
    if len(resolved_screenshots) == 1:
        return resolved_screenshots[0]
    return resolved_screenshots


def resolve_query_execution_inputs(
    message: "QueryMessage",
    *,
    artifact_store_cls: Type[ArtifactStore],
    session_manager_config: Any,
) -> QueryExecutionInputs:
    """Resolve screenshot/capture metadata and stable payload fields for one query."""
    resolved_screenshots = resolve_screenshots(
        message,
        artifact_store_cls=artifact_store_cls,
        session_manager_config=session_manager_config,
    )
    return QueryExecutionInputs(
        image_data=build_query_image_data(resolved_screenshots),
        capture_meta=resolve_query_screenshot_metadata(message),
        message_content=getattr(message.payload, "content", None),
        conversation_ref=getattr(message.payload, "conversation_ref", None),
    )
