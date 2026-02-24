"""
Tool sender.

Sends resolved tools to frontend by yielding events.
Only responsible for sending frontend events (ToolCallEvent, ToolBundleEvent, ToolOutputEvent).
Delegates preparation to ToolPreparer.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events import AgentStreamingEvent
from backend.src.core.events.streaming_events import (
    ToolBundleEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.core.interfaces.tool import ToolResult

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.preparer import ToolPreparer
    from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
    from backend.src.llm.parser_types import ParsedToolCall

logger = logging.getLogger(__name__)


class ToolSender:
    """
    Sends resolved tools to frontend.
    
    Responsibility: Sending frontend events only.
    Delegates preparation to ToolPreparer and yields frontend events.
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
        Send resolved tools to frontend by yielding events.
        
        First prepares tools,
        then sends frontend events (ToolCallEvent, ToolBundleEvent, ToolOutputEvent).
        
        Args:
            tool_calls: List of parsed tool calls from LLM
            session: The current agent session
            
        Yields:
            AgentStreamingEvent: ToolCallEvent, ToolBundleEvent, ToolOutputEvent (frontend)
        """
        preparation_result = await self.preparer.prepare(tool_calls, session)
        
        # Handle errors: create synthetic results and yield error events
        for tool_call, error_msg in preparation_result.errors:
            execution_ref = ExecutionRef.from_metadata(tool_call.metadata)
            request_id = execution_ref.request_id if execution_ref else None
            if not request_id:
                logger.warning(f"Error tool call missing request_id: {tool_call.tool_name}")
                continue
            
            # Create synthetic tool result for error handling
            synthetic_result = self.synthetic_result_factory.create(tool_call, error_msg)
            
            # Store in pending results so orchestrator can find it immediately
            session.register_pending_tool_result(request_id, synthetic_result)
            
            # PROTOCOL VIOLATION FIX: Yield ToolCallEvent before ToolOutputEvent
            # Frontend expects a tool call event before any output event to maintain
            # the request/response state machine.
            # Mark failed-resolution tool calls as non-executable on frontend.
            tool_metadata = dict(tool_call.metadata) if isinstance(tool_call.metadata, dict) else {}
            tool_metadata.setdefault(
                "model_facing_tool_call",
                self._build_model_facing_tool_call(
                    tool_name=tool_call.tool_name,
                    parameters=tool_call.parameters,
                    metadata=tool_call.metadata,
                ),
            )
            tool_metadata["coordinate_resolution_failed"] = True
            tool_metadata["skip_frontend_execution"] = True
            tool_metadata.setdefault("request_id", request_id)
            yield ToolCallEvent(
                tool_name=tool_call.tool_name,
                parameters=tool_call.parameters,  # Use original parameters (coordinate resolution failed)
                request_id=request_id,
                metadata=tool_metadata,
            )
            
            # Yield ToolOutputEvent for backend-side failure
            # This is the ONLY case where backend emits ToolOutputEvent:
            # - Tool never reached frontend (coordinate resolution failed)
            # - Frontend doesn't know about the failure
            # - Backend must notify frontend of the error
            yield ToolOutputEvent(
                tool_name=tool_call.tool_name,
                success=False,
                output=error_msg,
                error=error_msg,
                execution_time=0.0,
                metadata={
                    "coordinate_resolution_failed": True,
                    "skip_frontend_execution": True,
                    "request_id": request_id,
                },
            )

        if preparation_result.errors and preparation_result.bundle_id:
            self._store_failed_bundle_result(
                session=session,
                bundle_id=preparation_result.bundle_id,
                tool_calls=tool_calls,
                errors=preparation_result.errors,
            )
            return

        # If there were errors and this was a single tool, we're done (already yielded error events above)
        if preparation_result.errors and not preparation_result.bundle_id:
            return
        
        # Send frontend events for prepared tools (bundles may have partial tools even with errors)
        if preparation_result.bundle_id:
            # Bundle: send single ToolBundleEvent
            tools = []
            for resolved_call in preparation_result.resolved_calls:
                tool_metadata = self._build_tool_event_metadata(resolved_call)
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
                    tool_metadata = self._build_tool_event_metadata(resolved_call)
                    yield ToolCallEvent(
                        tool_name=resolved_call.tool_name,
                        parameters=resolved_call.parameters,
                        request_id=request_id,
                        metadata=tool_metadata,
                    )
                    logger.debug(f"Sent tool call event: {resolved_call.tool_name} (request_id={request_id[:15]})")

    def _build_tool_event_metadata(self, resolved_call: Any) -> Dict[str, Any]:
        """
        Merge resolved metadata with model-facing tool-call details.

        Keeping this centralized prevents drift between single-call and bundle payloads.
        """
        tool_metadata = (
            dict(resolved_call.metadata)
            if isinstance(resolved_call.metadata, dict)
            else {}
        )
        tool_metadata.setdefault(
            "model_facing_tool_call",
            self._build_model_facing_tool_call(
                tool_name=resolved_call.original_call.tool_name,
                parameters=resolved_call.original_call.parameters,
                metadata=resolved_call.original_call.metadata,
            ),
        )
        return tool_metadata

    @staticmethod
    def _build_model_facing_tool_call(
        *,
        tool_name: str,
        parameters: Optional[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Build canonical model-facing tool-call payload for frontend transparency."""
        model_tool_call: Dict[str, Any] = {
            "name": tool_name,
            "arguments": dict(parameters or {}),
        }
        if isinstance(metadata, dict):
            tool_call_id = metadata.get("tool_call_id")
            if isinstance(tool_call_id, str) and tool_call_id:
                model_tool_call["id"] = tool_call_id
        return model_tool_call

    def _store_failed_bundle_result(
        self,
        *,
        session: "AgentSession",
        bundle_id: str,
        tool_calls: List["ParsedToolCall"],
        errors: List[tuple["ParsedToolCall", str]],
    ) -> None:
        """
        Store a synthetic bundle failure result so orchestration can continue
        without dispatching any frontend sidecar actions.
        """
        first_error = errors[0][1] if errors else "Tool preparation failed"
        failed_call = errors[0][0] if errors else None
        failed_tool_name = failed_call.tool_name if failed_call else "unknown"
        skipped_reason = (
            "Skipped because bundle preparation failed before frontend dispatch"
        )
        step_results = []
        for call in tool_calls:
            if call is failed_call:
                output = first_error
            else:
                output = f"{skipped_reason} ({failed_tool_name})"
            step_results.append(
                {
                    "tool": call.tool_name,
                    "status": "error",
                    "output": output,
                }
            )

        bundle_result = ToolResult(
            success=False,
            error=first_error,
            llm_content=f"Error: {first_error}",
            data={
                "bundle_id": bundle_id,
                "status": "failure",
                "step_results": step_results,
                "error": first_error,
            },
        )
        result_storage = session.get_result_storage()
        result_storage.store_bundled_result(bundle_id, bundle_result)
        # Resolve waiting future immediately if it already exists.
        result_storage.resolve_bundle_future(bundle_id, bundle_result)
