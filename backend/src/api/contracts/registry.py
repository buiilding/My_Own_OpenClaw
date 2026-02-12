"""API-owned contract registry adapter.

This module centralizes message/schema/formatter registry views for API runtime
and tests. Future migration to a core-owned contract source should happen here.
"""

from __future__ import annotations

from dataclasses import dataclass

from backend.src.api.contracts.formatter_specs import (
    FormatterSpec,
    get_formatter_specs as get_formatter_specs_from_registry,
)
from backend.src.api.contracts.message_types import (
    INCOMING_MESSAGE_TYPES,
    OUTGOING_SCHEMA_MESSAGE_TYPES,
    IncomingMessageType,
    OutgoingMessageType,
)
from backend.src.api.schemas.common import BaseMessage
from backend.src.api.schemas.incoming import (
    ListModelsMessage,
    LoadSettingsMessage,
    QueryMessage,
    RehydrateConversationMessage,
    ToolBundleResultMessage,
    ToolResultMessage,
    UpdateSettingsMessage,
    WakewordDetectedMessage,
)
from backend.src.api.schemas.outgoing import (
    AssistantMessageFullMessage,
    AudioChunkMessage,
    ErrorResponse,
    LlmThought,
    MemoryStoreMessage,
    StreamingComplete,
    StreamingResponse,
    SystemPromptMessage,
    TokenCountMessage,
    ToolBundleMessage,
    ToolCallMessage,
    ToolOutputMessage,
    ToolSchemasMessage,
    UserMessageFullMessage,
    WakewordActivatedMessage,
    WakewordGreetingMessage,
)


@dataclass(frozen=True)
class MessageContract:
    """Message type and model pairing."""

    message_type: str
    model: type[BaseMessage]


INCOMING_CONTRACTS: tuple[MessageContract, ...] = (
    MessageContract(IncomingMessageType.QUERY, QueryMessage),
    MessageContract(
        IncomingMessageType.REHYDRATE_CONVERSATION,
        RehydrateConversationMessage,
    ),
    MessageContract(IncomingMessageType.LOAD_SETTINGS, LoadSettingsMessage),
    MessageContract(IncomingMessageType.LIST_MODELS, ListModelsMessage),
    MessageContract(IncomingMessageType.UPDATE_SETTINGS, UpdateSettingsMessage),
    MessageContract(IncomingMessageType.WAKEWORD_DETECTED, WakewordDetectedMessage),
    MessageContract(IncomingMessageType.TOOL_RESULT, ToolResultMessage),
    MessageContract(IncomingMessageType.TOOL_BUNDLE_RESULT, ToolBundleResultMessage),
)

OUTGOING_SCHEMA_CONTRACTS: tuple[MessageContract, ...] = (
    MessageContract(OutgoingMessageType.ERROR, ErrorResponse),
    MessageContract(OutgoingMessageType.STREAMING_RESPONSE, StreamingResponse),
    MessageContract(OutgoingMessageType.STREAMING_COMPLETE, StreamingComplete),
    MessageContract(OutgoingMessageType.LLM_THOUGHT, LlmThought),
    MessageContract(OutgoingMessageType.TOOL_CALL, ToolCallMessage),
    MessageContract(OutgoingMessageType.TOOL_BUNDLE, ToolBundleMessage),
    MessageContract(OutgoingMessageType.TOOL_OUTPUT, ToolOutputMessage),
    MessageContract(OutgoingMessageType.AUDIO_CHUNK, AudioChunkMessage),
    MessageContract(OutgoingMessageType.WAKEWORD_ACTIVATED, WakewordActivatedMessage),
    MessageContract(OutgoingMessageType.WAKEWORD_GREETING, WakewordGreetingMessage),
    MessageContract(OutgoingMessageType.SYSTEM_PROMPT, SystemPromptMessage),
    MessageContract(OutgoingMessageType.TOOL_SCHEMAS, ToolSchemasMessage),
    MessageContract(OutgoingMessageType.TOKEN_COUNT, TokenCountMessage),
    MessageContract(OutgoingMessageType.MEMORY_STORE, MemoryStoreMessage),
    MessageContract(OutgoingMessageType.USER_MESSAGE_FULL, UserMessageFullMessage),
    MessageContract(
        OutgoingMessageType.ASSISTANT_MESSAGE_FULL, AssistantMessageFullMessage
    ),
)


def get_incoming_message_types() -> set[str]:
    return {contract.message_type for contract in INCOMING_CONTRACTS}


def get_outgoing_schema_message_types() -> set[str]:
    return {contract.message_type for contract in OUTGOING_SCHEMA_CONTRACTS}


def get_formatter_specs() -> tuple[FormatterSpec, ...]:
    return get_formatter_specs_from_registry()


def validate_registry_alignment() -> None:
    """Fail fast if API-local registries drift from canonical constants."""

    incoming_contract_types = get_incoming_message_types()
    if incoming_contract_types != set(INCOMING_MESSAGE_TYPES):
        raise ValueError(
            "Incoming contract type mismatch: "
            f"{sorted(incoming_contract_types)} != {sorted(INCOMING_MESSAGE_TYPES)}"
        )

    outgoing_contract_types = get_outgoing_schema_message_types()
    if outgoing_contract_types != set(OUTGOING_SCHEMA_MESSAGE_TYPES):
        raise ValueError(
            "Outgoing schema contract type mismatch: "
            f"{sorted(outgoing_contract_types)} != {sorted(OUTGOING_SCHEMA_MESSAGE_TYPES)}"
        )
