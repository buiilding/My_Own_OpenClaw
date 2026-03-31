"""
Tool sender.

Dispatches prepared tool calls to the correct execution surface:
- frontend-executed tools emit tool-call / tool-bundle events only
- backend-executed tools run immediately and emit their own tool-output events
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional

from backend.src.core.events import AgentStreamingEvent
from backend.src.core.events.streaming_events import (
    SearchSourceEvent,
    ToolBundleEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.agent.tools.preparation.types.execution_ref import ExecutionRef
from backend.src.core.interfaces.tool import ToolResult
from backend.src.sdk.tool import Tool
from backend.src.tools.web_search.source_normalization import (
    extract_tool_result_web_search_sources,
)

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.tools.preparation.preparer import ToolPreparer
    from backend.src.agent.tools.processing.synthetic_factory import SyntheticResultFactory
    from backend.src.llm.parser_types import ParsedToolCall

logger = logging.getLogger(__name__)
_PRE_DISPATCH_VALIDATION_FAILURE_MARKER = (
    "call is invalid and was rejected before frontend execution"
)


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
            failure_metadata = self._build_preparation_failure_metadata(
                tool_call=tool_call,
                request_id=request_id,
                error_msg=error_msg,
            )
            tool_metadata.update(failure_metadata)
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
                metadata=failure_metadata,
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
        
        # Send frontend or backend execution events for prepared tools.
        if preparation_result.bundle_id:
            if self._bundle_contains_backend_tool(preparation_result.resolved_calls, session):
                self._store_failed_bundle_result(
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
                    tool = self._resolve_tool(session, resolved_call.tool_name)
                    if self._execution_target(tool) == "backend":
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
    def _resolve_tool(session: "AgentSession", tool_name: str) -> Optional[Tool]:
        tool_registry = getattr(session, "tool_registry", None)
        if tool_registry is None:
            return None
        return tool_registry.get_tool(tool_name)

    @staticmethod
    def _execution_target(tool: Optional[Tool]) -> str:
        if tool is None:
            return "frontend"
        target = getattr(tool, "execution_target", "frontend")
        return target if isinstance(target, str) and target.strip() else "frontend"

    def _bundle_contains_backend_tool(
        self,
        resolved_calls: List[Any],
        session: "AgentSession",
    ) -> bool:
        for resolved_call in resolved_calls:
            tool = self._resolve_tool(session, resolved_call.tool_name)
            if self._execution_target(tool) == "backend":
                return True
        return False

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
            result = await self._run_backend_tool(tool, resolved_call, session)

        backend_metadata = dict(tool_metadata)
        backend_metadata["skip_frontend_execution"] = True
        backend_metadata["request_id"] = request_id
        session.register_pending_tool_result(request_id, result)

        yield ToolCallEvent(
            tool_name=resolved_call.tool_name,
            parameters=resolved_call.parameters,
            request_id=request_id,
            metadata=backend_metadata,
        )

        for source_event in self._build_search_source_events(result):
            yield source_event

        output_text = (
            result.return_display
            or result.llm_content
            or result.format_for_history(resolved_call.tool_name)
        )
        yield ToolOutputEvent(
            tool_name=resolved_call.tool_name,
            success=result.success,
            output=output_text,
            error=result.error,
            execution_time=0.0,
            metadata=backend_metadata,
        )

    async def _run_backend_tool(
        self,
        tool: Tool,
        resolved_call: Any,
        session: "AgentSession",
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

    @staticmethod
    def _build_search_source_events(result: ToolResult) -> List[SearchSourceEvent]:
        data = result.data if isinstance(result.data, dict) else None
        normalized_sources = extract_tool_result_web_search_sources(data)
        events: List[SearchSourceEvent] = []
        for source in normalized_sources:
            events.append(
                SearchSourceEvent(
                    url=source["url"],
                    title=source.get("title"),
                    provider=source["provider"],
                    query=source.get("query"),
                    rank=source.get("rank"),
                )
            )
        return events

    @staticmethod
    def _build_preparation_failure_metadata(
        *,
        tool_call: "ParsedToolCall",
        request_id: str,
        error_msg: str,
    ) -> Dict[str, Any]:
        metadata: Dict[str, Any] = {
            "skip_frontend_execution": True,
            "request_id": request_id,
        }
        if _PRE_DISPATCH_VALIDATION_FAILURE_MARKER in error_msg:
            metadata["llm_tool_call_validation_failed"] = True
        else:
            metadata["coordinate_resolution_failed"] = True
        return metadata

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
