import logging
from copy import deepcopy
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.types.schemas import LLMMessage, NormalizedLLMResponse
from backend.src.llm.models.models_config import resolve_provider_thinking_preference
from backend.src.llm.providers.online import OnlineLLMProvider
from backend.src.llm.providers.openai_responses_runtime import (
    get_openai_responses_completion,
    stream_openai_responses_events,
)

logger = logging.getLogger(__name__)

_OPENAI_CHAT_UNSUPPORTED_ROOT_SCHEMA_KEYS = ("oneOf", "anyOf", "allOf", "enum", "not")


class OpenAIProvider(OnlineLLMProvider):
    """Provider for OpenAI models."""

    provider_label = "OpenAI"
    model_prefix = None
    invalid_response_message = "Invalid response from OpenAI"

    @staticmethod
    def _merge_openai_chat_property_schema(
        existing: Dict[str, Any],
        incoming: Dict[str, Any],
    ) -> Dict[str, Any]:
        if existing == incoming:
            return deepcopy(existing)

        existing_options = existing.get("anyOf")
        incoming_options = incoming.get("anyOf")
        if isinstance(existing_options, list):
            merged_options = deepcopy(existing_options)
        else:
            merged_options = [deepcopy(existing)]

        if isinstance(incoming_options, list):
            candidate_options = [deepcopy(option) for option in incoming_options]
        else:
            candidate_options = [deepcopy(incoming)]

        for option in candidate_options:
            if option not in merged_options:
                merged_options.append(option)

        description_parts: list[str] = []
        for schema in (existing, incoming):
            description = schema.get("description")
            if isinstance(description, str) and description not in description_parts:
                description_parts.append(description)

        merged: Dict[str, Any] = {"anyOf": merged_options}
        if description_parts:
            merged["description"] = " / ".join(description_parts)
        return merged

    @classmethod
    def _make_openai_chat_parameters_compatible(
        cls,
        parameters: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not any(key in parameters for key in _OPENAI_CHAT_UNSUPPORTED_ROOT_SCHEMA_KEYS):
            return deepcopy(parameters)

        compatible = deepcopy(parameters)
        root_properties = compatible.get("properties")
        if not isinstance(root_properties, dict):
            root_properties = {}
            compatible["properties"] = root_properties

        branch_schemas: list[Dict[str, Any]] = []
        for key in ("oneOf", "anyOf", "allOf"):
            branches = compatible.pop(key, None)
            if isinstance(branches, list):
                branch_schemas.extend(branch for branch in branches if isinstance(branch, dict))

        compatible.pop("enum", None)
        compatible.pop("not", None)

        for branch in branch_schemas:
            branch_properties = branch.get("properties")
            if not isinstance(branch_properties, dict):
                continue
            for property_name, property_schema in branch_properties.items():
                if property_name == "action" and "action" in root_properties:
                    continue
                if not isinstance(property_schema, dict):
                    continue
                existing = root_properties.get(property_name)
                if not isinstance(existing, dict):
                    root_properties[property_name] = deepcopy(property_schema)
                    continue
                root_properties[property_name] = cls._merge_openai_chat_property_schema(
                    existing,
                    property_schema,
                )

        description = compatible.get("description")
        compatibility_note = (
            "Action-specific field requirements are enforced by runtime validation."
        )
        if isinstance(description, str):
            if compatibility_note not in description:
                compatible["description"] = f"{description} {compatibility_note}"
        else:
            compatible["description"] = compatibility_note

        return compatible

    @classmethod
    def _make_openai_chat_tools_compatible(
        cls,
        tools: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        compatible_tools: List[Dict[str, Any]] = []
        for tool in tools:
            if not isinstance(tool, dict):
                compatible_tools.append(tool)
                continue
            function_payload = tool.get("function")
            if not isinstance(function_payload, dict):
                compatible_tools.append(tool)
                continue
            parameters = function_payload.get("parameters")
            if not isinstance(parameters, dict):
                compatible_tools.append(tool)
                continue

            compatible_tool = deepcopy(tool)
            compatible_tool["function"]["parameters"] = cls._make_openai_chat_parameters_compatible(
                parameters
            )
            compatible_tools.append(compatible_tool)
        return compatible_tools

    @staticmethod
    def _uses_native_reasoning_runtime(model: str) -> bool:
        return (
            resolve_provider_thinking_preference(
                model_id=model,
                provider_name="openai",
            )
            is True
        )

    @classmethod
    def _uses_responses_runtime(
        cls,
        model: str,
        *,
        native_web_search_enabled: bool = False,
    ) -> bool:
        return cls._uses_native_reasoning_runtime(model) or native_web_search_enabled

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> NormalizedLLMResponse:
        native_web_search_enabled = bool(request_kwargs.get("native_web_search_enabled"))
        if self._uses_responses_runtime(
            model,
            native_web_search_enabled=native_web_search_enabled,
        ):
            return await get_openai_responses_completion(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
                max_output_tokens=request_kwargs.get("max_output_tokens"),
                native_web_search_enabled=native_web_search_enabled,
                include_reasoning=self._uses_native_reasoning_runtime(model),
            )
        return await super().get_completion(
            model=model,
            messages=messages,
            **request_kwargs,
        )

    async def _stream_internal(
        self,
        model: str,
        messages: List[LLMMessage],
        **request_kwargs: Any,
    ) -> AsyncGenerator[Any, None]:
        native_web_search_enabled = bool(request_kwargs.get("native_web_search_enabled"))
        if self._uses_responses_runtime(
            model,
            native_web_search_enabled=native_web_search_enabled,
        ):
            async for event in stream_openai_responses_events(
                self,
                model=model,
                messages=messages,
                tools=request_kwargs.get("tools"),
                tool_choice=request_kwargs.get("tool_choice"),
                parallel_tool_calls=request_kwargs.get("parallel_tool_calls"),
                max_output_tokens=request_kwargs.get("max_output_tokens"),
                native_web_search_enabled=native_web_search_enabled,
                include_reasoning=self._uses_native_reasoning_runtime(model),
            ):
                yield event
            return

        async for event in super()._stream_internal(
            model=model,
            messages=messages,
            **request_kwargs,
        ):
            yield event

    def supports_streaming_tool_turns(self, model: str) -> bool:
        return self._uses_native_reasoning_runtime(model)

    def _apply_provider_request_params(
        self,
        params: Dict[str, Any],
        *,
        model: str,
        runtime_model_id: str | None = None,
    ) -> Dict[str, Any]:
        tools = params.get("tools")
        if isinstance(tools, list):
            params["tools"] = self._make_openai_chat_tools_compatible(tools)
        _ = model
        _ = runtime_model_id
        return params
