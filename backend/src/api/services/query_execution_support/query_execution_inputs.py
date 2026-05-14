"""Query payload input shaping helpers for query execution service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, List, Optional, Type, Union

from backend.src.api.services.query_execution_support.query_execution_runtime import (
    resolve_query_runtime_system_state,
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
    workspace_path: Optional[str]
    repo_instruction_messages: Optional[list[dict[str, str]]]
    client_prompt_layers: Optional[list[dict[str, Any]]]
    agent_definition: Optional[Any]
    runtime_system_state: Optional[dict[str, str]]


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
    user_id: Optional[str] = None,
) -> QueryExecutionInputs:
    """Resolve screenshot/capture metadata and stable payload fields for one query."""
    resolved_screenshots = resolve_screenshots(
        message,
        artifact_store_cls=artifact_store_cls,
        session_manager_config=session_manager_config,
        user_id=user_id,
    )
    raw_repo_instruction_messages = getattr(
        message.payload,
        "repo_instruction_messages",
        None,
    )
    repo_instruction_messages = None
    if raw_repo_instruction_messages is not None:
        repo_instruction_messages = [
            {
                "role": instruction.role,
                "content": instruction.content,
            }
            for instruction in raw_repo_instruction_messages
        ]
    raw_client_prompt_layers = getattr(message.payload, "client_prompt_layers", None)
    client_prompt_layers = None
    if raw_client_prompt_layers is not None:
        client_prompt_layers = [
            {
                "id": layer.id,
                "type": layer.type,
                "priority": layer.priority,
                "content": layer.content,
            }
            for layer in raw_client_prompt_layers
        ]

    return QueryExecutionInputs(
        image_data=build_query_image_data(resolved_screenshots),
        capture_meta=resolve_query_screenshot_metadata(message),
        message_content=getattr(message.payload, "content", None),
        conversation_ref=getattr(message.payload, "conversation_ref", None),
        workspace_path=getattr(message.payload, "workspace_path", None),
        repo_instruction_messages=repo_instruction_messages,
        client_prompt_layers=client_prompt_layers,
        agent_definition=getattr(message.payload, "agent_definition", None),
        runtime_system_state=resolve_query_runtime_system_state(message),
    )
