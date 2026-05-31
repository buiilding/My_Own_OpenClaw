from dataclasses import dataclass, field
from typing import Any

from backend.src.core.events import AgentStreamingEvent
from backend.src.core.events.streaming_events import ToolCallEvent, ToolOutputEvent
from backend.src.core.interfaces.tool import ToolResult


@dataclass(frozen=True)
class ToolExecutionEnvelope:
    tool_name: str
    parameters: dict[str, Any]
    request_id: str
    metadata: dict[str, Any]
    result: ToolResult
    auxiliary_events: list[AgentStreamingEvent] = field(default_factory=list)


def emit_tool_execution_envelope(
    envelope: ToolExecutionEnvelope,
) -> list[AgentStreamingEvent]:
    output_text = (
        envelope.result.output
        or envelope.result.format_for_history(envelope.tool_name)
    )
    return [
        ToolCallEvent(
            tool_name=envelope.tool_name,
            parameters=envelope.parameters,
            request_id=envelope.request_id,
            metadata=envelope.metadata,
        ),
        *envelope.auxiliary_events,
        ToolOutputEvent(
            tool_name=envelope.tool_name,
            success=envelope.result.success,
            output=output_text,
            error=envelope.result.error,
            execution_time=0.0,
            metadata=envelope.metadata,
        ),
    ]
