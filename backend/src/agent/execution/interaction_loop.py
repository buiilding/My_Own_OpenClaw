"""
Interaction Loop.

Controls the agent execution state machine.
Only responsible for loop control, sequencing, and termination decisions.
All content, I/O, and presentation is delegated to specialized components.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List
from uuid import uuid4

from backend.src.agent.execution.tool_call_bridge import (
    build_recoverable_tool_output_message,
    extract_tool_call_id_from_error,
    extract_tool_call_ids,
    extract_tool_name_from_error,
    is_recoverable_llm_tool_call_error,
    to_history_tool_calls,
    to_parsed_response,
)
from backend.src.agent.execution.policies import (
    IterationPolicy,
    ToolExecutionPolicy,
)
from backend.src.core.types.enums import MessageType
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionFailedEvent,
    ContextCompactionStartedEvent,
    ErrorEvent,
    FullResponseEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.infrastructure.exceptions import (
    LLMRateLimitError,
)
from backend.src.core.types.schemas import NormalizedLLMResponse
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.llm.conversation_context import ConversationContext
    from backend.src.agent.llm.event_presenter import EventPresenter
    from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
    from backend.src.agent.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class InteractionLoop:
    """
    Controls the agent execution state machine.
    
    Responsibility: Loop control, sequencing, and termination decisions only.
    Delegates all content, I/O, and presentation to specialized components.
    """

    def __init__(
        self,
        session: "AgentSession",
        prompt_coordinator: "ConversationContext",
        llm_handler: "LLMStreamProcessor",
        tool_executor: "ToolOrchestrator",
        event_presenter: "EventPresenter",
    ):
        """
        Initialize the interaction loop.
        
        Args:
            session: Agent session for state access
            prompt_coordinator: Manages conversation context
            llm_handler: Processes LLM streaming and token counting
            tool_executor: Orchestrates tool execution
            event_presenter: Presents frontend events
        """
        self.session = session
        self.prompt_coordinator = prompt_coordinator
        self.llm_handler = llm_handler
        self.tool_executor = tool_executor
        self.event_presenter = event_presenter

    async def run_loop(self) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Executes the agent loop: Prompt -> LLM -> Parse -> Tools -> Repeat.
        
        Controls the state machine and delegates all work to specialized components.
        """
        iteration = 0
        iteration_policy = IterationPolicy(
            max_iterations=self.session.cfg.max_agent_iterations
        )
        tool_execution_policy = ToolExecutionPolicy()

        while iteration_policy.should_continue(iteration):
            iteration = iteration_policy.begin_next_iteration(iteration)

            compaction_engine = getattr(self.session, "compaction_engine", None)
            if iteration > 1 and compaction_engine is not None:
                mid_compaction_decision = compaction_engine.evaluate(
                    reason="auto-mid"
                )
                if mid_compaction_decision.should_compact:
                    yield ContextCompactionStartedEvent(
                        reason="auto-mid",
                        strategy=mid_compaction_decision.strategy_name,
                        before_tokens=mid_compaction_decision.before_tokens,
                        projected_tokens=mid_compaction_decision.projected_tokens,
                    )
                    try:
                        mid_compaction_result = await compaction_engine.compact(
                            reason="auto-mid",
                            decision=mid_compaction_decision,
                        )
                        yield ContextCompactionCompletedEvent(
                            reason="auto-mid",
                            strategy=mid_compaction_result.strategy_name,
                            before_tokens=mid_compaction_result.before_tokens,
                            after_tokens=mid_compaction_result.after_tokens,
                            removed_messages=mid_compaction_result.removed_messages,
                            summary_preview=self._summary_preview(
                                mid_compaction_result.summary_text
                            ),
                            skipped_reason=mid_compaction_result.skip_reason,
                        )
                    except Exception as exc:
                        logger.error(
                            "[Compaction] Mid-loop compaction failed: %s",
                            exc,
                            exc_info=True,
                        )
                        yield ContextCompactionFailedEvent(
                            reason="auto-mid",
                            strategy=mid_compaction_decision.strategy_name,
                            error=str(exc),
                            before_tokens=mid_compaction_decision.before_tokens,
                        )

            # Step 1: Get prompt (delegated to PromptCoordinator)
            prompt, tool_schemas, prompt_metadata = self.prompt_coordinator.get_prompt(
                iteration
            )

            # Present prompt metadata events (only on first iteration)
            if iteration == 1 and prompt_metadata:
                async for event in self.event_presenter.present_prompt_metadata(
                    prompt_metadata
                ):
                    yield event

            # Step 2: Get LLM response (delegated to LLMInteractionHandler)
            llm_response_text = ""
            llm_error_event_content = None
            try:
                async for event in self.llm_handler.get_response(
                    prompt,
                    tools=tool_schemas,
                ):
                    # Forward streaming events
                    yield event

                    # Track full response
                    if isinstance(event, FullResponseEvent):
                        llm_response_text = event.content
                    elif isinstance(event, ErrorEvent):
                        llm_error_event_content = event.content

            except LLMRateLimitError:
                error_msg = "Rate limit exceeded. Please wait."
                async for event in self._emit_error_and_record(error_msg):
                    yield event
                return
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                error_msg = f"LLM error: {str(e)}"
                async for event in self._emit_error_and_record(error_msg):
                    yield event
                return

            if llm_error_event_content:
                if self._is_recoverable_llm_tool_call_error(llm_error_event_content):
                    logger.info(
                        "Recoverable LLM tool-call format error detected; "
                        "emitting synthetic tool output and continuing turn: %s",
                        llm_error_event_content,
                    )
                    async for event in self._emit_recoverable_tool_call_error(
                        llm_error_event_content
                    ):
                        yield event
                    continue
                logger.warning(
                    "Aborting interaction loop turn after LLM stream error event: %s",
                    llm_error_event_content,
                )
                self.session.history.add_assistant_message(
                    f"[System Error: {llm_error_event_content}]"
                )
                return

            normalized_response = self.llm_handler.get_last_response_payload() or {
                "content": llm_response_text
            }
            parsed_response = self._to_parsed_response(normalized_response)
            llm_response_text = parsed_response.text_content

            if llm_response_text:
                async for event in self.event_presenter.present_assistant_message(
                    llm_response_text
                ):
                    yield event

            # Step 4: Decision - final answer or tools?
            if not parsed_response.has_tool_calls:
                if not llm_response_text.strip():
                    llm_response_text = self._build_empty_final_response_fallback()
                    async for event in self.event_presenter.present_assistant_message(
                        llm_response_text
                    ):
                        yield event
                # Final answer - update history and present completion
                self.session.history.add_assistant_message(llm_response_text)
                async for event in self.event_presenter.present_completion(
                    llm_response_text
                ):
                    yield event
                return

            # Step 5: Tool execution path
            # PREMATURE TERMINATION FIX: If we're in the extra turn after final tool execution,
            # do not allow more tools - force final answer to prevent infinite loops
            if not iteration_policy.can_execute_tools():
                logger.warning(
                    "Agent attempted to execute tools in extra turn after max_iterations. "
                    "Forcing final answer instead."
                )
                # Treat as final answer (no tools)
                self.session.history.add_assistant_message(llm_response_text)
                async for event in self.event_presenter.present_completion(
                    llm_response_text
                ):
                    yield event
                return

            # Check if this is the final iteration and we're executing tools
            # If so, set flag to allow one more turn after tool execution
            iteration_policy.mark_tool_execution(iteration)

            # Add assistant message with tool calls to history (context is king!)
            self.session.history.add_assistant_message(
                llm_response_text,
                tool_calls=self._to_history_tool_calls(parsed_response.tool_calls),
            )

            # Execute tools (yields execution-time events)
            # BUNDLE EXECUTION FIX: Wait for bundle results before processing next response.
            # This ensures that if a bundle is sent to frontend, we wait for its completion
            # before the interaction loop continues to the next iteration, preventing race
            # conditions where subsequent tool calls execute before the bundle finishes.
            # SESSION STATE LEAK FIX: Use finally block to ensure cleanup runs even if
            # execute() raises an exception or client disconnects (GeneratorExit)
            results_processed = False
            try:
                # Check if this is a bundle before executing
                is_bundle = tool_execution_policy.is_bundle(len(parsed_response.tool_calls))
                tool_call_ids = self._extract_tool_call_ids(parsed_response.tool_calls)
                self.session.history.stage_tool_call_ids(
                    tool_call_ids,
                    consume_all_on_next_output=is_bundle,
                )
                
                # Yield all resolution events (ToolBundleEvent or ToolCallEvent)
                async for event in self.tool_executor.execute(parsed_response, self.session):
                    yield event
                
                # BUNDLE EXECUTION FIX: For bundles, wait for results immediately after
                # sending the bundle event, before the interaction loop continues.
                # This ensures the bundle completes before any subsequent tool calls.
                if is_bundle:
                    logger.info("Waiting for bundle execution to complete before continuing...")
                    await self.tool_executor.process_results(parsed_response, self.session)
                    results_processed = True
                    logger.info("Bundle execution completed, continuing interaction loop")
            except Exception as e:
                logger.error(f"Critical tool execution error: {e}", exc_info=True)
                error_msg = f"Tool execution error: {str(e)}"
                async for event in self._emit_error_and_record(error_msg):
                    yield event
                break
            finally:
                # SESSION STATE LEAK FIX: Always process results for cleanup, even if
                # execute() failed or client disconnected. This prevents tool state
                # (request_ids, pending results, resolved calls) from leaking in session.
                # Process tool results for history storage (for LLM context)
                # Note: Frontend displays tool results immediately after execution.
                # Backend only processes results for conversation history, not for display.
                # ToolOutputEvent is only emitted for backend-side failures (e.g., coordinate resolution)
                # which are already yielded by ToolSender during tool preparation/sending.
                # BUNDLE EXECUTION FIX: For bundles, process_results() was already called above,
                # but we still need to handle cleanup for non-bundle tools or error cases.
                if not results_processed:
                    try:
                        await self.tool_executor.process_results(parsed_response, self.session)
                    except Exception as cleanup_error:
                        # Log but don't re-raise - we're in finally block and don't want to
                        # mask the original exception if one occurred
                        logger.error(
                            f"Error during tool result cleanup: {cleanup_error}",
                            exc_info=True
                        )

        # Max iterations reached
        if iteration_policy.reached_hard_limit(iteration):
            logger.warning("Max iterations reached in agent loop.")
            error_msg = "I reached the maximum number of steps without finishing."
            async for event in self._emit_error_and_record(error_msg):
                yield event
            return

    async def _emit_error_and_record(
        self, error_msg: str
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Emit an error event and persist it in assistant history."""
        async for event in self.event_presenter.present_error(error_msg):
            yield event
        self.session.history.add_assistant_message(f"[System Error: {error_msg}]")

    async def _emit_recoverable_tool_call_error(
        self,
        error_msg: str,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """
        Convert malformed LLM tool-call payloads into synthetic tool output.

        This keeps the interaction loop alive and gives the model explicit,
        tool-shaped feedback so it can retry with corrected arguments.
        """
        tool_name = self._extract_tool_name_from_error(error_msg)
        tool_call_id = self._extract_tool_call_id_from_error(error_msg)
        if not tool_call_id:
            tool_call_id = f"llm_tool_call_error_{uuid4().hex[:12]}"

        tool_output_message = self._build_recoverable_tool_output_message(tool_name, error_msg)
        metadata = {
            "request_id": tool_call_id,
            "llm_tool_call_validation_failed": True,
            "skip_frontend_execution": True,
        }

        # Maintain ToolCallEvent -> ToolOutputEvent protocol ordering for frontend state.
        yield ToolCallEvent(
            tool_name=tool_name,
            parameters={},
            request_id=tool_call_id,
            metadata=metadata,
        )
        yield ToolOutputEvent(
            tool_name=tool_name,
            success=False,
            output=tool_output_message,
            error=error_msg,
            execution_time=0.0,
            metadata=metadata,
        )

        # Feed the synthetic tool output back into history for the next LLM turn.
        self.session.history.stage_tool_call_ids([tool_call_id])
        self.session.history.add_tool_output(tool_output_message)

    def _to_parsed_response(
        self, normalized_response: NormalizedLLMResponse
    ) -> ParsedResponse:
        """Bridge native SDK tool calls into ParsedResponse shape."""
        return to_parsed_response(normalized_response)

    @staticmethod
    def _to_history_tool_calls(
        parsed_tool_calls: List[ParsedToolCall],
    ) -> List[Dict[str, Any]]:
        """Render parsed tool calls into assistant-history tool_calls format."""
        return to_history_tool_calls(parsed_tool_calls)

    @staticmethod
    def _extract_tool_call_ids(parsed_tool_calls: List[ParsedToolCall]) -> List[str]:
        """Collect tool-call ids in emission order for tool-result linkage."""
        return extract_tool_call_ids(parsed_tool_calls)

    def _build_empty_final_response_fallback(self) -> str:
        """
        Provide a deterministic user-facing fallback when model returns empty final text.
        """
        tool_output_summary = self._extract_last_tool_output_summary()
        if tool_output_summary:
            return (
                "I completed the requested tool action(s), but the model returned an empty "
                "final response. Latest tool output:\n\n"
                f"{tool_output_summary}"
            )
        return (
            "I completed the requested action(s), but the model returned an empty "
            "final response."
        )

    def _extract_last_tool_output_summary(self) -> str:
        """Return a concise summary from the most recent tool-output history entry."""
        try:
            stored_messages = self.session.history.get_stored_messages()
        except Exception:
            return ""

        for message in reversed(stored_messages):
            if message.message_type != MessageType.TOOL_OUTPUT:
                continue
            content = (message.content or "").strip()
            if not content:
                continue
            if "<system_context>" in content:
                content = content.split("<system_context>", 1)[0].strip()
            if len(content) > 600:
                content = f"{content[:597]}..."
            return content
        return ""

    @staticmethod
    def _is_recoverable_llm_tool_call_error(error_msg: str) -> bool:
        """Return True for recoverable model-generated tool-call format errors."""
        return is_recoverable_llm_tool_call_error(error_msg)

    @staticmethod
    def _extract_tool_name_from_error(error_msg: str) -> str:
        """Best-effort extraction of tool name from provider error text."""
        return extract_tool_name_from_error(error_msg)

    @staticmethod
    def _extract_tool_call_id_from_error(error_msg: str) -> str:
        """Best-effort extraction of tool call id from provider error text."""
        return extract_tool_call_id_from_error(error_msg)

    @staticmethod
    def _build_recoverable_tool_output_message(tool_name: str, error_msg: str) -> str:
        """Format synthetic tool output in standard tool-output message style."""
        return build_recoverable_tool_output_message(tool_name, error_msg)

    @staticmethod
    def _summary_preview(summary_text: str) -> str:
        """Return a short compaction summary preview for event payloads."""
        preview = (summary_text or "").strip()
        if not preview:
            return ""
        if len(preview) > 180:
            return f"{preview[:177]}..."
        return preview
