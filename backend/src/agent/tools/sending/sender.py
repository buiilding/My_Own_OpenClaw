"""
Tool sender.

Dispatches prepared tool calls to the correct execution surface:
- frontend-executed tools emit tool-call / tool-bundle events only
- backend-executed tools run immediately and emit their own tool-output events
"""
import asyncio
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events import AgentStreamingEvent
from backend.src.core.events.streaming_events import (
    StreamingEvent,
    ToolBundleEvent,
    ToolCallEvent,
)
from backend.src.agent.tools.sending.execution_envelope import (
    emit_tool_execution_envelope,
)
from backend.src.agent.tools.sending.execution_lanes import (
    build_backend_execution_lane,
    build_preparation_failure_lane,
    build_tool_event_metadata,
    bundle_contains_backend_tool,
    resolve_execution_target,
    resolve_tool,
    store_failed_bundle_result,
)
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.tool import Tool

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.preparer import ToolPreparer
    from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
    from backend.src.llm.parser_types import ParsedToolCall

logger = logging.getLogger(__name__)
_BACKEND_TOOL_PROGRESS_POLL_SECONDS = 0.05


class ToolSender:
    """
    Sends resolved tools to the SDK/local runtime.
    
    Responsibility: Sending execution events only.
    Delegates preparation to ToolPreparer and yields tool execution events.
    """

    def __init__(
        self,
        preparer: "ToolPreparer",
        synthetic_result_factory: "SyntheticResultFactory",
    ):
        """
        Initialize the tool sender.
        
        Args:
            preparer: Preparer for tool preparation/resolution
            synthetic_result_factory: Factory for synthetic error results
        """
        self.preparer = preparer
        self.synthetic_result_factory = synthetic_result_factory

    async def send_tools(
        self,
        tool_calls: List["ParsedToolCall"],
        session: "AgentSession",
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Send resolved tools to the SDK/local runtime by yielding events.
        
        First prepares tools,
        then sends execution events (ToolCallEvent, ToolBundleEvent, ToolOutputEvent).
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: ToolCallEvent, ToolBundleEvent, ToolOutputEvent
        """
        preparation_result = await self.preparer.prepare(tool_calls, session)

        for tool_call, error_msg in preparation_result.errors:
            failure_lane = build_preparation_failure_lane(
                tool_call=tool_call,
                error_msg=error_msg,
                synthetic_result_factory=self.synthetic_result_factory,
            )
            if failure_lane is None:
                logger.warning(f"Error tool call missing request_id: {tool_call.tool_name}")
                continue

            request_id, synthetic_result, envelope = failure_lane
            session.register_pending_tool_result(request_id, synthetic_result)

            for event in emit_tool_execution_envelope(envelope):
                yield event

        if preparation_result.errors and preparation_result.bundle_id:
            store_failed_bundle_result(
                session=session,
                bundle_id=preparation_result.bundle_id,
                tool_calls=tool_calls,
                errors=preparation_result.errors,
            )
            return

        # If there were errors and this was a single tool, we're done (already yielded error events above)
        if preparation_result.errors and not preparation_result.bundle_id:
            return
        
        # Send frontend or backend execution events for prepared tools.
        if preparation_result.bundle_id:
            if bundle_contains_backend_tool(preparation_result.resolved_calls, session):
                store_failed_bundle_result(
                    session=session,
                    bundle_id=preparation_result.bundle_id,
                    tool_calls=tool_calls,
                    errors=[(
                        tool_calls[0],
                        "Tool bundles that include backend-executed tools are not supported yet.",
                    )],
                )
                return
            # Bundle: send single ToolBundleEvent
            tools = []
            for resolved_call in preparation_result.resolved_calls:
                tool_metadata = build_tool_event_metadata(resolved_call)
                tool_dict = {
                    "name": resolved_call.tool_name,
                    "args": resolved_call.parameters,
                }
                tool_dict["metadata"] = tool_metadata
                tools.append(tool_dict)
            
            yield ToolBundleEvent(
                bundle_id=preparation_result.bundle_id,
                tools=tools
            )
            logger.info(f"Sent bundle event: {len(tools)} tools (bundle_id={preparation_result.bundle_id[:15]})")
        else:
            # Single tool: send ToolCallEvent
            if preparation_result.resolved_calls:
                resolved_call = preparation_result.resolved_calls[0]
                execution_ref = resolved_call.execution_ref
                request_id = execution_ref.request_id if execution_ref else None
                
                if request_id:
                    tool_metadata = build_tool_event_metadata(resolved_call)
                    tool = resolve_tool(session, resolved_call.tool_name)
                    if resolve_execution_target(tool) == "backend":
                        async for event in self._execute_backend_tool(
                            tool=tool,
                            resolved_call=resolved_call,
                            session=session,
                            request_id=request_id,
                            tool_metadata=tool_metadata,
                        ):
                            yield event
                    else:
                        yield ToolCallEvent(
                            tool_name=resolved_call.tool_name,
                            parameters=resolved_call.parameters,
                            request_id=request_id,
                            metadata=tool_metadata,
                        )
                        logger.debug(
                            "Sent tool call event: %s (request_id=%s)",
                            resolved_call.tool_name,
                            request_id[:15],
                        )

    async def _execute_backend_tool(
        self,
        *,
        tool: Optional[Tool],
        resolved_call: Any,
        session: "AgentSession",
        request_id: str,
        tool_metadata: Dict[str, Any],
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        if tool is None:
            error_msg = f"Backend tool '{resolved_call.tool_name}' is not registered."
            result = ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
            )
        else:
            progress_queue: asyncio.Queue[AgentStreamingEvent] = asyncio.Queue()

            async def emit_streaming_event(event: AgentStreamingEvent) -> None:
                if not isinstance(event, StreamingEvent):
                    logger.debug(
                        "Ignoring non-streaming backend tool auxiliary event for %s: %r",
                        resolved_call.tool_name,
                        event,
                    )
                    return
                await progress_queue.put(event)

            result_task = asyncio.create_task(
                self._run_backend_tool(
                    tool,
                    resolved_call,
                    session,
                    additional_services={
                        "emit_streaming_event": emit_streaming_event,
                        "tool_request_id": request_id,
                    },
                )
            )

            while True:
                if result_task.done() and progress_queue.empty():
                    break
                try:
                    event = await asyncio.wait_for(
                        progress_queue.get(),
                        timeout=_BACKEND_TOOL_PROGRESS_POLL_SECONDS,
                    )
                except asyncio.TimeoutError:
                    continue
                yield event

            result = await result_task

        session.register_pending_tool_result(request_id, result)
        if isinstance(result.metadata, dict) and result.metadata.get(
            "suppress_wrapper_events"
        ):
            return
        execution_lane = build_backend_execution_lane(
            resolved_call=resolved_call,
            request_id=request_id,
            tool_metadata=tool_metadata,
            result=result,
        )

        for event in emit_tool_execution_envelope(execution_lane):
            yield event

    async def _run_backend_tool(
        self,
        tool: Tool,
        resolved_call: Any,
        session: "AgentSession",
        *,
        additional_services: Optional[Dict[str, Any]] = None,
    ) -> ToolResult:
        context_factory = getattr(getattr(session, "tool_registry", None), "context_factory", None)
        if context_factory is None:
            error_msg = "Tool context factory is unavailable."
            return ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
            )

        try:
            validated_args = tool.args_model.model_validate(resolved_call.parameters or {})
            tool_context = context_factory.create_tool_context(
                user_id=getattr(session, "user_id", "default_user"),
                session_id=getattr(session, "session_id", "default_session"),
                session_ref=session,
                additional_services=additional_services,
            )
            raw_result = await tool.run(validated_args, tool_context)
        except Exception as exc:
            logger.error(
                "Backend tool execution failed for %s: %s",
                resolved_call.tool_name,
                exc,
                exc_info=True,
            )
            error_msg = str(exc) or f"{resolved_call.tool_name} failed"
            return ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
            )

        if isinstance(raw_result, ToolResult):
            return raw_result
        if isinstance(raw_result, dict):
            return ToolResult.from_dict(raw_result)
        if raw_result is None:
            return ToolResult(
                success=True,
                llm_content=f"{resolved_call.tool_name} completed.",
                return_display=f"{resolved_call.tool_name} completed.",
            )
        return ToolResult(
            success=True,
            data=raw_result,
            llm_content=str(raw_result),
            return_display=str(raw_result),
        )
