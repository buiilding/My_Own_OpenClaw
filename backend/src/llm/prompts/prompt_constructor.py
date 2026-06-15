"""
Prompt Constructor for constructing LLM prompts with tool schemas and images.

SECURITY: This module is a TRUST BOUNDARY.
- All inputs are treated as HOSTILE/UNTRUSTED
- Size limits are enforced on message history and content
- Security violations raise hard errors (no soft fallbacks)
- Failures propagate immediately to prevent silent bypasses
- All violations are tracked via observability hooks for abuse detection

Trust Boundary: Message History → LLM Prompt

OBSERVABILITY: All violations are logged with structured metrics:
- Size limit violations (actual_size, max_size, ratio)
- History size violations
- Content size violations

This module handles the construction of prompts using structured Prompt objects,
eliminating circular parsing patterns and preserving data integrity.
"""

import json
import logging
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Type, Union

from backend.src.core.config import AppConfig
from backend.src.core.infrastructure.error_types import InputSizeLimitError
from backend.src.core.messages.content_blocks import extract_text_from_content_part
from backend.src.core.messages.converters import content_to_message_content
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.observability.trust_boundary_metrics import MetricsService
from backend.src.core.types.enums import MessageRole, MessageType
from backend.src.core.types.schemas import LLMMessage
from backend.src.llm.prompts.prompt_images import (
    PromptImageProjectionError,
    PromptImageProjector,
    policy_from_config,
)
from backend.src.llm.prompts.prompt_metadata import (
    PromptMetadata,
    ProviderPrompt,
    UserMessageMetadata,
)
from backend.src.llm.prompts.prompts import PromptManager
from backend.src.llm.prompts.repo_instructions import (
    resolve_workspace_repo_instruction_messages,
)
from backend.src.services.artifacts import ArtifactStore
from backend.src.tools.provider_projection import project_tool_schemas_for_provider
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.tool_policy import ToolPolicy
from backend.src.tools.tool_specs import get_tool_spec_name

# system_monitor removed - frontend handles system state

logger = logging.getLogger(__name__)


@lru_cache(maxsize=128)
def _xml_tag_pattern(tag_name: str) -> re.Pattern[str]:
    """Compile and cache XML-like tag patterns used for prompt metadata extraction."""
    escaped_tag = re.escape(tag_name)
    # Allow attributes with quoted values that may include '>' characters.
    # Example: <tag code="if a > b">payload</tag>
    return re.compile(
        f"<{escaped_tag}(?:\\s+(?:[^>\"']+|\"[^\"]*\"|'[^']*')*)?>(.*?)</{escaped_tag}>",
        re.DOTALL,
    )


class PromptConstructor:
    """
    Constructs prompts for LLM interactions, including system prompts and tool schemas.

    SECURITY: This is a trust boundary. All inputs are validated with size limits.
    Violations raise hard errors.
    """

    BOUNDARY_NAME = "prompt_constructor"

    def __init__(
        self,
        tool_registry: ToolRegistry,
        config: AppConfig,
        metrics_service: MetricsService,
        system_prompt: Optional[str] = None,
        artifact_store_cls: Type[ArtifactStore] = ArtifactStore,
    ):
        """
        Initialize the prompt constructor.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration (REQUIRED for security limits)
            metrics_service: MetricsService for observability (injected via DI)
            system_prompt: Optional custom system prompt. If None, loads from PromptManager
                          (assumes PromptManager.initialize() was called at startup)

        Raises:
            ValueError: If config is None (security requirement)
        """
        if config is None:
            raise ValueError(
                "config is required for PromptConstructor. "
                "Cannot enforce security limits without configuration (security requirement)."
            )

        self.tool_registry = tool_registry
        self.config = config
        self.artifact_store_cls = artifact_store_cls
        self.tool_policy = ToolPolicy.from_config(config)
        # Load system prompt at runtime (not import time) to avoid crashes.
        self.system_prompt = system_prompt or PromptManager().render_system_prompt(
            allowed_coordinate_methods=self.tool_policy.get_allowed_mouse_coordinate_methods()
        )
        self.metrics = metrics_service.get_metrics("prompt_constructor")
        self.limits = config.security_limits
        self.prompt_image_projector = PromptImageProjector(policy_from_config(config))
        self.workspace_path: Optional[str] = None
        self.repo_instruction_messages: List[LLMMessage] = []
        self.client_prompt_layers: List[Dict[str, Any]] = []
        self.client_tool_schemas: List[Dict[str, Any]] = []

    def get_tool_schema_surfaces(
        self,
        *,
        prompt_messages: Optional[List[LLMMessage]] = None,
    ) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Return canonical and provider-facing tool schemas for the prompt."""
        client_tool_schemas = self._get_client_tool_schemas()
        client_tool_names = {
            tool_name
            for schema in client_tool_schemas
            for tool_name in [get_tool_spec_name(schema)]
            if isinstance(tool_name, str)
        }
        tool_schemas = [
            schema
            for schema in self._get_policy_filtered_registry_tool_schemas()
            if get_tool_spec_name(schema) not in client_tool_names
        ]
        filtered_client_schemas = self.tool_policy.filter_tool_schemas(
            client_tool_schemas,
        )
        tool_schemas.extend(filtered_client_schemas)
        projected_schemas = project_tool_schemas_for_provider(
            tool_schemas=tool_schemas,
            config=self.config,
            tool_policy=self.tool_policy,
        )
        provider_tool_schemas = self.tool_policy.filter_projected_tool_schemas(
            projected_schemas,
        )
        return tool_schemas, provider_tool_schemas

    def _get_filtered_tool_schemas(
        self,
        *,
        prompt_messages: Optional[List[LLMMessage]] = None,
    ) -> List[Dict[str, Any]]:
        """Return prompt-visible tool schemas filtered by centralized tool policy."""
        _, provider_tool_schemas = self.get_tool_schema_surfaces(
            prompt_messages=prompt_messages,
        )
        return provider_tool_schemas

    def _get_policy_filtered_registry_tool_schemas(self) -> List[Dict[str, Any]]:
        model_tool_names_getter = getattr(
            self.tool_registry, "get_model_tool_names", None
        )
        if callable(model_tool_names_getter):
            filtered_names = self.tool_policy.filter_tool_names(
                model_tool_names_getter(),
            )
            return (
                self.tool_registry.get_function_declarations_filtered(filtered_names)
                or []
            )
        return self.tool_registry.get_function_declarations() or []

    def _get_client_tool_schemas(self) -> List[Dict[str, Any]]:
        return [
            dict(schema)
            for schema in self.client_tool_schemas
            if isinstance(schema, dict)
        ]

    def build_provider_prompt(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]] = None,
        include_tools: bool = True,
    ) -> ProviderPrompt:
        """
        Constructs the provider-bound prompt from stored history.

        SECURITY: This is a trust boundary. All inputs are validated with:
        - History size limits (max_message_history_size)
        - Message content size limits (max_message_content_size)
        - Total prompt size limits (max_prompt_size)

        The returned object is the full provider input: prompt messages,
        native tool schemas, and transparency metadata derived from the same
        prompt shape.

        Args:
            stored_messages: ConversationHistory instance - provides conversation history
            include_tools: Whether to include tool schemas in metadata + API params

        Returns:
            ProviderPrompt ready for model invocation.

        Raises:
            InputSizeLimitError: If any size limit is exceeded
        """
        prompt_messages = self.build_prompt_messages(stored_messages)
        tool_schemas = []
        if include_tools:
            tool_schemas = self._get_filtered_tool_schemas(
                prompt_messages=prompt_messages,
            )
        user_message_metadata = self._build_user_message_metadata(
            stored_messages,
            prompt_messages,
        )

        metadata = PromptMetadata(
            system_prompt=self._get_effective_system_prompt(prompt_messages),
            tool_schemas=tool_schemas,
            client_prompt_layers=self._get_client_prompt_layer_metadata(),
            client_prompt_layer_summary=self._get_client_prompt_layer_summary(),
            user_message_metadata=user_message_metadata,
        )

        return ProviderPrompt(
            messages=prompt_messages,
            tool_schemas=tool_schemas,
            metadata=metadata,
        )

    def _get_prompt_messages(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]],
    ) -> List[LLMMessage]:
        """Get rendered prompt history from stored messages object when available."""
        if isinstance(stored_messages, list) and all(
            isinstance(message, StoredMessage) for message in stored_messages
        ):
            return [
                self._stored_message_to_prompt_message(message, index)
                for index, message in enumerate(stored_messages)
            ]
        if stored_messages and hasattr(stored_messages, "get_stored_messages"):
            stored_entries = stored_messages.get_stored_messages()
            if isinstance(stored_entries, list) and all(
                isinstance(message, StoredMessage) for message in stored_entries
            ):
                return [
                    self._stored_message_to_prompt_message(message, index)
                    for index, message in enumerate(stored_entries)
                ]
        if stored_messages and hasattr(stored_messages, "get_history"):
            return stored_messages.get_history()
        return []

    def _stored_message_to_prompt_message(
        self,
        message: StoredMessage,
        message_index: int,
    ) -> LLMMessage:
        """Render stored history with prompt-time image-ref hydration."""
        prompt_message = message.to_llm_message()
        image_parts = self._prompt_image_parts_for_message(message, message_index)
        if not image_parts:
            return prompt_message

        content = prompt_message.get("content")
        if isinstance(content, list):
            prompt_message["content"] = [*content, *image_parts]
        else:
            prompt_message["content"] = [
                {"type": "text", "text": str(content or "")},
                *image_parts,
            ]
        return prompt_message

    def _prompt_image_parts_for_message(
        self,
        message: StoredMessage,
        message_index: int,
    ) -> List[Dict[str, Any]]:
        refs = StoredMessage._normalized_image_refs(message.image_refs)
        if not refs:
            return []
        policy = self.prompt_image_projector.policy
        if len(refs) > policy.max_images_per_message:
            self._raise_size_limit(
                check="prompt_image_count",
                actual_size=len(refs),
                max_size=policy.max_images_per_message,
                metadata={
                    "message_index": message_index,
                    "role": message.role.value,
                },
            )

        try:
            store = self.artifact_store_cls.from_config(self.config)
        except Exception as exc:
            logger.warning(
                "Failed to initialize artifact store for prompt images: %s", exc
            )
            return []

        image_parts: List[Dict[str, Any]] = []
        for image_index, image_ref in enumerate(refs):
            try:
                image_data = store.load_base64(
                    image_ref,
                    owner_user_id=message.image_owner_user_id,
                )
                prompt_image = self.prompt_image_projector.project_base64_image(
                    image_data,
                    image_index=image_index,
                    image_ref=image_ref,
                )
            except PromptImageProjectionError as exc:
                self._raise_size_limit(
                    check=exc.check,
                    actual_size=exc.actual_size,
                    max_size=exc.max_size,
                    metadata={
                        "message_index": message_index,
                        "role": message.role.value,
                        "image_index": exc.image_index,
                        "image_ref": exc.image_ref,
                    },
                )
            except Exception as exc:
                logger.warning(
                    "Failed to resolve prompt image artifact %s at message index %s: %s",
                    image_ref,
                    message_index,
                    exc,
                )
                continue
            image_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": prompt_image.data_url},
                }
            )
        return image_parts

    def build_prompt_messages(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]],
    ) -> List[LLMMessage]:
        """Build model-visible prompt messages without provider tool parameters."""
        return self._build_prompt_messages(stored_messages)

    def _build_prompt_messages(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]],
    ) -> List[LLMMessage]:
        """Build model-visible prompt messages, including static prompt context."""
        history_messages = self._get_prompt_messages(stored_messages)
        system_messages, conversation_messages = self._split_system_messages(
            history_messages
        )
        prompt_messages: List[LLMMessage] = []
        if system_messages:
            prompt_messages.extend(system_messages)
        elif self.system_prompt:
            prompt_messages.append(
                {"role": MessageRole.SYSTEM.value, "content": self.system_prompt}
            )
        prompt_messages.extend(self._get_repo_instruction_messages())
        prompt_messages.extend(self._get_client_prompt_layer_messages())
        prompt_messages.extend(conversation_messages)
        self._validate_prompt_messages(prompt_messages)
        return prompt_messages

    def _split_system_messages(
        self,
        prompt_messages: List[LLMMessage],
    ) -> tuple[List[LLMMessage], List[LLMMessage]]:
        system_messages: List[LLMMessage] = []
        conversation_messages: List[LLMMessage] = []
        for message in prompt_messages:
            if (
                isinstance(message, dict)
                and message.get("role") == MessageRole.SYSTEM.value
            ):
                system_messages.append(message)
            else:
                conversation_messages.append(message)
        return system_messages, conversation_messages

    def _get_effective_system_prompt(self, prompt_messages: List[LLMMessage]) -> str:
        for message in prompt_messages:
            if (
                isinstance(message, dict)
                and message.get("role") == MessageRole.SYSTEM.value
            ):
                content = message.get("content")
                if isinstance(content, str):
                    return content
        return self.system_prompt

    def _validate_prompt_messages(self, prompt_messages: List[LLMMessage]) -> None:
        """Enforce prompt-size limits after every model-visible layer is assembled."""
        message_count = len(prompt_messages)
        if message_count > self.limits.max_message_history_size:
            self._raise_size_limit(
                check="message_history_size",
                actual_size=message_count,
                max_size=self.limits.max_message_history_size,
            )

        total_size = 0
        for index, message in enumerate(prompt_messages):
            content_size = self._calculate_message_content_size(message)
            if content_size > self.limits.max_message_content_size:
                self._raise_size_limit(
                    check="message_content_size",
                    actual_size=content_size,
                    max_size=self.limits.max_message_content_size,
                    metadata={
                        "message_index": index,
                        "role": (
                            message.get("role") if isinstance(message, dict) else None
                        ),
                    },
                )

            total_size += self._calculate_message_size(message)
            if total_size > self.limits.max_prompt_size:
                self._raise_size_limit(
                    check="prompt_size",
                    actual_size=total_size,
                    max_size=self.limits.max_prompt_size,
                    metadata={"message_index": index},
                )

    def _raise_size_limit(
        self,
        *,
        check: str,
        actual_size: int,
        max_size: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        violation_metadata = {"check": check}
        if metadata:
            violation_metadata.update(metadata)
        self.metrics.record_size_violation(
            actual_size=actual_size,
            max_size=max_size,
            boundary_name=self.BOUNDARY_NAME,
            metadata=violation_metadata,
        )
        raise InputSizeLimitError(
            f"Prompt {check} {actual_size} exceeds maximum {max_size}",
            actual_size=actual_size,
            max_size=max_size,
            boundary_name=self.BOUNDARY_NAME,
            metadata=violation_metadata,
        )

    def _get_repo_instruction_messages(self) -> List[LLMMessage]:
        if self.repo_instruction_messages:
            return list(self.repo_instruction_messages)
        return resolve_workspace_repo_instruction_messages(self.workspace_path)

    def _get_client_prompt_layer_messages(self) -> List[LLMMessage]:
        layers = [
            layer
            for layer in self.client_prompt_layers
            if isinstance(layer, dict) and isinstance(layer.get("content"), str)
        ]
        layers.sort(key=lambda layer: int(layer.get("priority", 100)))
        messages: List[LLMMessage] = []
        for layer in layers:
            layer_id = str(layer.get("id") or "client-layer")
            layer_type = str(layer.get("type") or "custom")
            content = layer["content"].strip()
            if not content:
                continue
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"# Client prompt layer: {layer_id}\n\n"
                        f'<CLIENT_PROMPT_LAYER type="{layer_type}">\n'
                        f"{content}\n"
                        "</CLIENT_PROMPT_LAYER>"
                    ),
                }
            )
        return messages

    def _get_client_prompt_layer_metadata(self) -> List[Dict[str, Any]]:
        layers = [
            layer
            for layer in self.client_prompt_layers
            if isinstance(layer, dict) and isinstance(layer.get("content"), str)
        ]
        layers.sort(key=lambda layer: int(layer.get("priority", 100)))
        metadata: List[Dict[str, Any]] = []
        for layer in layers:
            content = layer["content"]
            if not content.strip():
                continue
            item = {
                "id": str(layer.get("id") or "client-layer"),
                "type": str(layer.get("type") or "custom"),
                "priority": int(layer.get("priority", 100)),
                "content": content,
            }
            if isinstance(layer.get("revision"), str) and layer["revision"].strip():
                item["revision"] = layer["revision"].strip()
            if (
                isinstance(layer.get("source_path"), str)
                and layer["source_path"].strip()
            ):
                item["source_path"] = layer["source_path"].strip()
            metadata.append(item)
        return metadata

    def _get_client_prompt_layer_summary(self) -> Dict[str, Any]:
        metadata = self._get_client_prompt_layer_metadata()
        return {
            "count": len(metadata),
            "ids": [str(layer.get("id") or "") for layer in metadata],
            "revisions": [
                str(layer.get("revision") or "")
                for layer in metadata
                if layer.get("revision")
            ],
        }

    def get_prompt_token_count(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]],
        *,
        model_id: str,
        include_tools: bool = True,
    ) -> int:
        """Count tokens for the actual prompt shape sent to the model."""
        from backend.src.services.token_service import get_token_service

        token_service = get_token_service()
        provider_prompt = self.build_provider_prompt(
            stored_messages=stored_messages,
            include_tools=include_tools,
        )
        return token_service.count_tokens(
            provider_prompt.messages,
            model_id,
            tools=provider_prompt.tool_schemas if include_tools else None,
        )

    def _build_user_message_metadata(
        self,
        stored_messages: Optional[Union[List[StoredMessage], Any]],
        prompt_messages: List[LLMMessage],
    ) -> Optional[UserMessageMetadata]:
        """Build metadata payload for user_message_full transparency event."""
        if not stored_messages or not hasattr(stored_messages, "last_user_query"):
            return None

        last_user_query_stored = stored_messages.last_user_query
        if not last_user_query_stored:
            return None

        user_query = last_user_query_stored.user_query_raw or ""
        full_content = self._find_last_user_query_content(prompt_messages)
        context_xml, active_window = self._extract_context_metadata(full_content)
        context_type = self._determine_context_type(stored_messages)

        return UserMessageMetadata(
            original_query=user_query,
            full_content=full_content,
            context_type=context_type,
            injected_context=context_xml,
            active_window=active_window,
        )

    def _find_last_user_query_content(self, prompt_messages: List[LLMMessage]) -> str:
        """Find last user message text that includes a <user_query> block."""
        for msg in reversed(prompt_messages):
            if msg.get("role") != MessageRole.USER.value:
                continue
            msg_content = content_to_message_content(msg.get("content", ""))
            text_content = msg_content.get_text()
            if "<user_query>" in text_content:
                return text_content
        return ""

    def _extract_context_metadata(self, full_content: str) -> tuple[str, str]:
        """Extract system context XML and active window from rendered user content."""
        if not full_content:
            return "", "Unknown"

        context_xml = self._extract_xml_tag(full_content, "system_context")
        active_window = (
            self._extract_xml_tag_content(full_content, "active_window") or "Unknown"
        )
        return context_xml, active_window

    def _determine_context_type(self, stored_messages: Any) -> str:
        """Determine whether current message context is initial or sequential."""
        if not hasattr(stored_messages, "get_stored_messages"):
            return "sequential"

        stored_list = stored_messages.get_stored_messages()
        user_query_count = sum(
            1
            for msg in stored_list
            if getattr(msg, "message_type", None) == MessageType.USER_QUERY
        )
        return "initial" if user_query_count == 1 else "sequential"

    def _calculate_message_size(self, msg: Dict[str, Any]) -> int:
        """
        Calculate the size of a message in bytes.

        PERFORMANCE: Sums content lengths directly instead of serializing to JSON,
        avoiding O(N) allocation and CPU overhead on the hot path.
        """
        size = 0
        try:
            for key, value in msg.items():
                # Add key length
                if isinstance(key, str):
                    size += len(key)
                else:
                    size += len(str(key))

                # Add value length based on type
                if isinstance(value, str):
                    size += len(value)
                elif isinstance(value, (dict, list)):
                    # For complex nested structures, fallback to JSON serialization
                    # This is rare, so the overhead is acceptable
                    size += len(json.dumps(value, ensure_ascii=False))
                elif value is None:
                    # None adds minimal size (null in JSON)
                    size += 4
                else:
                    # For other types, estimate from string representation
                    size += len(str(value))
        except (TypeError, ValueError, AttributeError):
            # Fallback: if direct calculation fails, use JSON serialization
            try:
                return len(json.dumps(msg, ensure_ascii=False))
            except (TypeError, ValueError):
                return len(str(msg))

        return size

    def _calculate_message_content_size(self, msg: Dict[str, Any]) -> int:
        """Calculate the model-visible text size of a message content payload."""
        if not isinstance(msg, dict):
            return len(str(msg))
        content = msg.get("content", "")
        if isinstance(content, str):
            return len(content)
        if isinstance(content, list):
            size = 0
            for part in content:
                if isinstance(part, dict):
                    part_type = part.get("type")
                    if part_type in {"image_url", "input_image"} or "image_url" in part:
                        continue
                    text = extract_text_from_content_part(
                        part,
                        include_refusal=True,
                    )
                    if text:
                        size += len(text)
                    else:
                        size += len(json.dumps(part, ensure_ascii=False))
                else:
                    size += len(str(part))
            return size
        if isinstance(content, dict):
            try:
                return len(json.dumps(content, ensure_ascii=False))
            except (TypeError, ValueError):
                return len(str(content))
        if content is None:
            return 0
        return len(str(content))

    def _extract_xml_tag(self, content: str, tag_name: str) -> str:
        """
        Extract XML tag content using regex to handle attributes correctly.

        CORRECTNESS: Uses regex instead of naive find(">") to properly handle
        attributes that may contain '>' characters (e.g., code="if a > b:").

        SECURITY: Limits search space and validates extracted size to prevent DoS.

        NOTE: For production usage with hostile input, consider using a proper
        XML parser (lxml or defusedxml) which handles all edge cases correctly.
        """
        match = self._search_xml_tag(content, tag_name)
        if not match:
            return ""

        # Get the full match (entire tag including content)
        full_tag = match.group(0)

        # SECURITY: Validate extracted size
        if len(full_tag) > self.limits.max_message_content_size:
            return ""  # Too large, reject

        return full_tag

    def _extract_xml_tag_content(self, content: str, tag_name: str) -> Optional[str]:
        """
        Extract content inside XML tag using regex.

        CORRECTNESS: Uses regex to properly handle attributes, avoiding the
        naive find(">") bug that breaks on attributes containing '>'.

        SECURITY: Limits search space and validates extracted size.
        """
        match = self._search_xml_tag(content, tag_name)
        if not match:
            return None

        # Extract content (group 1 is the content between tags)
        extracted = match.group(1)

        # SECURITY: Validate extracted size
        if len(extracted) > self.limits.max_message_content_size:
            return None  # Too large, reject

        return extracted.strip()

    def _search_xml_tag(self, content: str, tag_name: str) -> Optional[re.Match[str]]:
        """Search bounded content for a tag using cached compiled pattern."""
        max_search_size = min(len(content), self.limits.max_message_content_size)
        search_content = content[:max_search_size]
        return _xml_tag_pattern(tag_name).search(search_content)

    def format_user_message_content(
        self,
        message_content: str,
        is_first_message: bool,
    ) -> str:
        """
        Format user message content.

        Args:
            message_content: Backend-rendered model-visible user message content
            is_first_message: Whether this is the first user message in the conversation

        Returns:
            Formatted message content ready to be added to history
        """
        if not isinstance(message_content, str) or not message_content:
            raise ValueError("message_content is required for user message formatting")

        # Tool schemas are passed via native API params, not embedded in user content.
        _ = is_first_message
        return message_content
