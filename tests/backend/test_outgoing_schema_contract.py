"""Contract checks between formatter outputs and outgoing WebSocket schemas."""

import pytest

from backend.src.api.processing.formatters.context_compaction_completed import (
    ContextCompactionCompletedEventFormatter,
)
from backend.src.api.processing.formatters.context_compaction_failed import (
    ContextCompactionFailedEventFormatter,
)
from backend.src.api.processing.formatters.context_compaction_started import (
    ContextCompactionStartedEventFormatter,
)
from backend.src.api.processing.formatters.model_history_updated import (
    ModelHistoryUpdatedEventFormatter,
)
from backend.src.api.processing.formatters.token_count import TokenCountEventFormatter
from backend.src.api.processing.formatters.system_prompt import (
    SystemPromptEventFormatter,
)
from backend.src.api.processing.formatters.tool_schemas import ToolSchemasEventFormatter
from backend.src.api.processing.formatters.trace_event import TraceEventFormatter
from backend.src.api.schemas.outgoing import (
    ContextCompactionCompletedMessage,
    ContextCompactionFailedMessage,
    ContextCompactionStartedMessage,
    ModelHistoryUpdatedMessage,
    ModelsListedMessage,
    QueryAcceptedMessage,
    QueryAcceptedPayload,
    SettingsLoadedMessage,
    SettingsUpdatedMessage,
    SystemPromptMessage,
    TokenCountMessage,
    TraceEventMessage,
    TraceEventPayload,
    ToolSchemasMessage,
    WebSearchProgressMessage,
    WebSearchProgressPayload,
)
from backend.src.core.events.streaming_events import (
    ContextCompactionCompletedEvent,
    ContextCompactionFailedEvent,
    ContextCompactionStartedEvent,
    ModelHistoryUpdatedEvent,
    SystemPromptEvent,
    TokenCountEvent,
    ToolSchemasEvent,
    TraceEvent,
)


def test_outgoing_progress_schemas_validate_concrete_messages() -> None:
    accepted = QueryAcceptedMessage.model_validate(
        {
            "type": "query-accepted",
            "id": "msg_accepted",
            "user_id": "user_1",
            "payload": {"status": "accepted"},
        }
    )
    progress = WebSearchProgressMessage.model_validate(
        {
            "type": "web-search-progress",
            "id": "msg_search",
            "user_id": "user_1",
            "payload": {"text": "Searching", "request_id": "req_1"},
        }
    )

    assert accepted.payload.status == "accepted"
    assert progress.payload.request_id == "req_1"


def test_trace_event_formatter_output_matches_schema_and_sanitizes_data() -> None:
    formatter = TraceEventFormatter()
    payload = formatter.format(
        TraceEvent(
            path="backend.stream",
            stage="stream",
            status="succeeded",
            runtime="backend",
            trace_id="trace_1",
            span_id="span_1",
            request_id="turn_1",
            duration_ms=123.4,
            data={
                "eventCount": 3,
                "content": "do not persist",
                "nested": {"apiKey": "secret", "safeFlag": True},
            },
            error={
                "code": "RuntimeError",
                "message": "short failure",
                "stack": "do not persist",
            },
        ),
        "msg_trace",
    )

    assert payload is not None
    parsed = TraceEventMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
            "conversation_ref": "conv_1",
            "turn_ref": "turn_1",
        }
    )
    assert parsed.type == "trace-event"
    assert parsed.payload.durationMs == 123
    assert parsed.payload.data == {
        "eventCount": 3,
        "content": "[redacted]",
        "nested": {"apiKey": "[redacted]", "safeFlag": True},
    }
    assert parsed.payload.error is not None
    assert parsed.payload.error.code == "RuntimeError"
    assert parsed.payload.error.message == "short failure"


def test_trace_event_schema_accepts_local_runtime_and_rejects_retired_runtime() -> None:
    payload = {
        "schemaVersion": 1,
        "path": "local_runtime.lifecycle",
        "stage": "status",
        "status": "succeeded",
        "runtime": "local-runtime",
    }

    assert TraceEventPayload.model_validate(payload).runtime == "local-runtime"
    with pytest.raises(ValueError):
        TraceEventPayload.model_validate({**payload, "runtime": "sidecar"})


def test_settings_and_model_events_match_outgoing_schema_contracts() -> None:
    loaded = SettingsLoadedMessage.model_validate(
        {
            "type": "settings-loaded",
            "id": "msg_settings_loaded",
            "user_id": "user_1",
            "payload": {
                "config": {
                    "model_provider": "openai",
                    "selected_model_id": "gpt-5.4@@gpt-5-4-none-thinking",
                }
            },
        }
    )
    updated = SettingsUpdatedMessage.model_validate(
        {
            "type": "settings-updated",
            "id": "msg_settings_updated",
            "user_id": "user_1",
            "payload": {"updated_keys": ["model_provider"]},
        }
    )
    models = ModelsListedMessage.model_validate(
        {
            "type": "models-listed",
            "id": "msg_models",
            "user_id": "user_1",
            "payload": [
                {
                    "id": "gpt-5.4@@gpt-5-4-none-thinking",
                    "provider": "openai",
                }
            ],
        }
    )

    assert loaded.payload.config["model_provider"] == "openai"
    assert updated.payload.updated_keys == ["model_provider"]
    assert models.payload[0]["provider"] == "openai"


def test_tool_schemas_formatter_output_matches_schema() -> None:
    formatter = ToolSchemasEventFormatter()
    payload = formatter.format(
        ToolSchemasEvent(
            tool_schemas=[
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "parameters": {"type": "object"},
                    },
                }
            ]
        ),
        "msg_1",
    )

    assert payload is not None
    parsed = ToolSchemasMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.type == "tool-schemas"


def test_tool_schemas_formatter_rejects_non_list_payload() -> None:
    formatter = ToolSchemasEventFormatter()

    with pytest.raises(ValueError, match="canonical tool object list"):
        formatter.format(
            ToolSchemasEvent(tool_schemas={"read_file": {"type": "object"}}),
            "msg_1",
        )


def test_system_prompt_formatter_includes_client_prompt_layers() -> None:
    formatter = SystemPromptEventFormatter()
    payload = formatter.format(
        SystemPromptEvent(
            content="base prompt",
            client_prompt_layers=[
                {
                    "id": "custom-instructions",
                    "type": "custom_instructions",
                    "priority": 60,
                    "content": "Prefer concise answers.",
                }
            ],
        ),
        "msg_prompt",
    )

    assert payload is not None
    parsed = SystemPromptMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.client_prompt_layers == [
        {
            "id": "custom-instructions",
            "type": "custom_instructions",
            "priority": 60,
            "content": "Prefer concise answers.",
        }
    ]


def test_token_count_formatter_output_matches_schema() -> None:
    formatter = TokenCountEventFormatter()
    payload = formatter.format(
        TokenCountEvent(
            prompt_tokens=12,
            visible_output_tokens=3,
            thinking_tokens=1,
            output_tokens_total=4,
            total_tokens=16,
            conversation_tokens=200,
            usage_source="provider",
            cached_tokens=10,
            cache_hit=True,
            cache_status="hit",
        ),
        "msg_2",
    )

    assert payload is not None
    parsed = TokenCountMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.total_tokens == 16
    assert parsed.payload.thinking_tokens == 1
    assert parsed.payload.cached_tokens == 10
    assert parsed.payload.cache_hit is True
    assert parsed.payload.cache_status == "hit"


def test_context_compaction_started_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionStartedEventFormatter()
    payload = formatter.format(
        ContextCompactionStartedEvent(
            reason="auto-pre",
            strategy="inline",
            before_tokens=2200,
            projected_tokens=2300,
        ),
        "msg_4",
    )

    assert payload is not None
    parsed = ContextCompactionStartedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.reason == "auto-pre"


def test_context_compaction_completed_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionCompletedEventFormatter()
    payload = formatter.format(
        ContextCompactionCompletedEvent(
            reason="auto-mid",
            strategy="inline",
            before_tokens=2400,
            after_tokens=900,
            removed_messages=10,
            summary_preview="short summary",
            summary_text="full summary text",
            replacement_history_preview=[
                {
                    "role": "assistant",
                    "message_type": "context_compaction",
                    "content": "[[CONTEXT COMPACTION SUMMARY]]\nfull summary text",
                },
                {
                    "role": "user",
                    "message_type": "user_query",
                    "content": "latest user turn",
                },
            ],
            replacement_history_entries=[
                {
                    "role": "assistant",
                    "message_type": "context_compaction",
                    "content": "[[CONTEXT COMPACTION SUMMARY]]\nfull summary text",
                },
                {
                    "role": "user",
                    "message_type": "user_query",
                    "content": "latest user turn",
                },
            ],
            skipped_reason=None,
        ),
        "msg_5",
    )

    assert payload is not None
    parsed = ContextCompactionCompletedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.after_tokens == 900
    assert parsed.payload.removed_messages == 10
    assert parsed.payload.summary_text == "full summary text"
    assert parsed.payload.replacement_history_preview[1]["message_type"] == "user_query"
    assert parsed.payload.replacement_history_entries is not None
    assert (
        parsed.payload.replacement_history_entries[0]["message_type"]
        == "context_compaction"
    )
    assert parsed.payload.skipped_reason is None


def test_context_compaction_completed_skipped_shape_matches_schema() -> None:
    formatter = ContextCompactionCompletedEventFormatter()
    payload = formatter.format(
        ContextCompactionCompletedEvent(
            reason="auto-mid",
            strategy="inline",
            before_tokens=1800,
            after_tokens=1800,
            removed_messages=0,
            summary_preview=None,
            summary_text=None,
            replacement_history_preview=None,
            replacement_history_entries=None,
            skipped_reason="below-threshold",
        ),
        "msg_5_skipped",
    )

    assert payload is not None
    parsed = ContextCompactionCompletedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.before_tokens == 1800
    assert parsed.payload.after_tokens == 1800
    assert parsed.payload.removed_messages == 0
    assert parsed.payload.replacement_history_entries is None
    assert parsed.payload.skipped_reason == "below-threshold"


def test_context_compaction_failed_formatter_output_matches_schema() -> None:
    formatter = ContextCompactionFailedEventFormatter()
    payload = formatter.format(
        ContextCompactionFailedEvent(
            reason="manual",
            strategy="inline",
            error="compaction failed",
            before_tokens=2000,
        ),
        "msg_6",
    )

    assert payload is not None
    parsed = ContextCompactionFailedMessage.model_validate(
        {
            **payload,
            "user_id": "user_1",
        }
    )
    assert parsed.payload.error == "compaction failed"


def test_model_history_updated_formatter_output_matches_schema() -> None:
    formatter = ModelHistoryUpdatedEventFormatter()
    payload = formatter.format(
        ModelHistoryUpdatedEvent(
            conversation_ref="conv-1",
            revision_id="rev-1",
            checkpoint_id="mh-1",
            created_at="2026-06-22T12:00:00+00:00",
            rows=[
                {
                    "id": "row-1",
                    "conversation_ref": "conv-1",
                    "revision_id": "rev-1",
                    "role": "tool",
                    "message_type": "tool_output",
                    "content": "bounded output",
                    "tool_call_id": "call-1",
                    "tool_name": "read_file",
                    "image_refs": ["artifact-1"],
                    "source_display_row_ids": [],
                }
            ],
        ),
        "msg_model_history",
    )

    assert payload is not None
    parsed = ModelHistoryUpdatedMessage.model_validate(
        {
            **payload,
            "user_id": "user-1",
            "conversation_ref": "conv-1",
            "turn_ref": "turn-1",
        }
    )
    assert parsed.type == "model-history-updated"
    assert parsed.payload.revision_id == "rev-1"
    assert parsed.payload.rows[0].message_type == "tool_output"
