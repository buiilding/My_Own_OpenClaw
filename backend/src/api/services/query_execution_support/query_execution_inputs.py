"""Query payload input shaping helpers for query execution service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, List, Optional, Type, Union

from backend.src.api.services.query_execution_support.query_execution_runtime import (
    resolve_inline_screenshot,
    resolve_query_runtime_system_state,
    resolve_query_screenshot_metadata,
    resolve_screenshot_refs,
)
from backend.src.services.artifacts.store import ArtifactStore

if TYPE_CHECKING:
    from backend.src.api.schemas.incoming import QueryMessage


@dataclass(frozen=True)
class QueryExecutionInputs:
    """Normalized query inputs forwarded to agent_instance.process_query."""

    image_data: Optional[Union[str, List[str]]]
    image_refs: Optional[List[str]]
    capture_meta: Optional[dict[str, Any]]
    message_content: str
    conversation_ref: Optional[str]
    workspace_path: Optional[str]
    repo_instruction_messages: Optional[list[dict[str, str]]]
    client_prompt_layers: Optional[list[dict[str, Any]]]
    agent_definition: Optional[Any]
    runtime_system_state: Optional[dict[str, str]]


def resolve_query_execution_inputs(
    message: "QueryMessage",
    *,
    artifact_store_cls: Type[ArtifactStore],
    session_manager_config: Any,
    user_id: Optional[str] = None,
) -> QueryExecutionInputs:
    """Resolve screenshot/capture metadata and stable payload fields for one query."""
    _ = (artifact_store_cls, session_manager_config, user_id)
    inline_screenshot = resolve_inline_screenshot(message)
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
        image_data=inline_screenshot,
        image_refs=resolve_screenshot_refs(message),
        capture_meta=resolve_query_screenshot_metadata(message),
        message_content=message.payload.content,
        conversation_ref=getattr(message.payload, "conversation_ref", None),
        workspace_path=getattr(message.payload, "workspace_path", None),
        repo_instruction_messages=repo_instruction_messages,
        client_prompt_layers=client_prompt_layers,
        agent_definition=getattr(message.payload, "agent_definition", None),
        runtime_system_state=resolve_query_runtime_system_state(message),
    )
