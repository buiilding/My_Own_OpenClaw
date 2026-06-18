"""
Event Presenter.

Formats and emits all client/UI events for the agent interaction loop.
"""

import logging
from typing import AsyncGenerator, Dict, List, Optional, cast

from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    AssistantMessageFullEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    SystemPromptEvent,
    ToolSchemasEvent,
    UserMessageFullEvent,
)
from backend.src.core.types.schemas import ToolSchema
from backend.src.llm.prompts.prompt_metadata import PromptMetadata


logger = logging.getLogger(__name__)


class EventPresenter:
    """
    Presents all client/UI events.

    Responsibility: Event formatting and emission only.
    Does NOT make business decisions or control flow.
    """

    def __init__(self):
        """Initialize the event presenter."""
        pass

    @staticmethod
    def _validate_tool_schemas(tool_schemas: object) -> List[ToolSchema]:
        """Validate transparency tool schemas use supported model-facing tool shapes."""
        if not isinstance(tool_schemas, list):
            raise ValueError("tool_schemas must be a list of canonical tool objects")

        for index, schema in enumerate(tool_schemas):
            if not isinstance(schema, dict):
                raise ValueError(f"tool_schemas[{index}] must be an object")

            tool_type = schema.get("type")
            if tool_type == "function":
                name = schema.get("name")
                parameters = schema.get("parameters")
                if not isinstance(name, str) or not name:
                    raise ValueError(
                        f"tool_schemas[{index}].name must be a non-empty string"
                    )
                if not isinstance(parameters, dict):
                    raise ValueError(
                        f"tool_schemas[{index}].parameters must be an object"
                    )
                continue

            if tool_type != "computer":
                raise ValueError(
                    f"tool_schemas[{index}].type must be 'function' or 'computer'"
                )

        return cast(List[ToolSchema], tool_schemas)

    async def present_prompt_metadata(
        self, metadata: Optional[PromptMetadata]
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents prompt metadata events (system prompt, user message, tool schemas).

        Only called on first iteration when metadata is available.

        Args:
            metadata: Prompt metadata from first iteration

        Yields:
            SystemPromptEvent, UserMessageFullEvent, ToolSchemasEvent
        """
        if not metadata:
            return

        # Present system prompt event
        yield SystemPromptEvent(
            content=metadata.system_prompt,
            tool_schemas=None,  # Tool schemas are emitted via dedicated tool-schemas event
            client_prompt_layers=metadata.client_prompt_layers,
            client_prompt_layer_summary=metadata.client_prompt_layer_summary,
        )

        # Present user message event
        if metadata.user_message_metadata:
            user_meta = metadata.user_message_metadata
            user_metadata: Dict[str, Optional[str]] = {
                "original_query": user_meta.original_query,
                "context_type": user_meta.context_type,
                "injected_context": user_meta.injected_context,
                "active_window": user_meta.active_window,
            }
            yield UserMessageFullEvent(
                content=user_meta.full_content,
                metadata=user_metadata,
            )

        # Present tool schemas as separate transparency event
        if metadata.tool_schemas is not None:
            validated_tool_schemas = self._validate_tool_schemas(metadata.tool_schemas)
            yield ToolSchemasEvent(tool_schemas=validated_tool_schemas)

    async def present_assistant_message(
        self, content: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents assistant message event.

        Args:
            content: Full assistant message content

        Yields:
            AssistantMessageFullEvent
        """
        yield AssistantMessageFullEvent(content=content)

    async def present_completion(
        self,
        final_response: str,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents completion event.

        Note: TokenCountEvent is already emitted by LLMInteractionHandler,
        so it doesn't need to be emitted here.

        Args:
            final_response: Final assistant response text

        Yields:
            StreamingCompleteEvent
        """
        yield StreamingCompleteEvent(final_response=final_response)

    async def present_error(
        self, error_message: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Presents error event.

        Args:
            error_message: Error message to present

        Yields:
            ErrorEvent
        """
        yield ErrorEvent(content=error_message)
