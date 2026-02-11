"""
Interaction Loop.

Controls the agent execution state machine.
Only responsible for loop control, sequencing, and termination decisions.
All content, I/O, and presentation is delegated to specialized components.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator

from backend.src.agent.execution.policies import (
    IterationPolicy,
    ParseRecoveryPolicy,
    ToolExecutionPolicy,
)
from backend.src.core.events.streaming_events import (
    AgentStreamingEvent,
    FullResponseEvent,
)
from backend.src.core.infrastructure.exceptions import (
    InputSizeLimitError,
    LLMRateLimitError,
    ParseTimeoutError,
    ParseValidationError,
)

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.llm.conversation_context import ConversationContext
    from backend.src.agent.llm.event_presenter import EventPresenter
    from backend.src.agent.llm.llm_stream_processor import LLMStreamProcessor
    from backend.src.agent.tools.orchestrator import ToolOrchestrator
    from backend.src.llm.parser import ResponseParser

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
        response_parser: "ResponseParser",
        tool_executor: "ToolOrchestrator",
        event_presenter: "EventPresenter",
    ):
        """
        Initialize the interaction loop.
        
        Args:
            session: Agent session for state access
            prompt_coordinator: Manages conversation context
            llm_handler: Processes LLM streaming and token counting
            response_parser: Parses LLM responses
            tool_executor: Orchestrates tool execution
            event_presenter: Presents frontend events
        """
        self.session = session
        self.prompt_coordinator = prompt_coordinator
        self.llm_handler = llm_handler
        self.response_parser = response_parser
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
        parse_recovery = ParseRecoveryPolicy()
        tool_execution_policy = ToolExecutionPolicy()

        while iteration_policy.should_continue(iteration):
            iteration = iteration_policy.begin_next_iteration(iteration)

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
            try:
                async for event in self.llm_handler.get_response(prompt):
                    # Forward streaming events
                    yield event

                    # Track full response
                    if isinstance(event, FullResponseEvent):
                        llm_response_text = event.content

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

            # Step 3: Parse response (async, offloaded to thread pool)
            try:
                parsed_response = await self.response_parser.parse_response(llm_response_text)
            except (ParseValidationError, ParseTimeoutError, InputSizeLimitError) as e:
                async for event in self._handle_parse_validation_error(parse_recovery, e):
                    yield event
                continue

            # Present assistant message event
            async for event in self.event_presenter.present_assistant_message(
                llm_response_text
            ):
                yield event

            # Step 4: Decision - final answer or tools?
            if not parsed_response.has_tool_calls:
                # Final answer - update history and present completion
                # Use llm_response_text for consistency (text_content should match when no tools)
                self.session.history.add_assistant_message(llm_response_text)
                async for event in self.event_presenter.present_completion(
                    parsed_response.text_content
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
                    parsed_response.text_content or llm_response_text
                ):
                    yield event
                return

            # Check if this is the final iteration and we're executing tools
            # If so, set flag to allow one more turn after tool execution
            iteration_policy.mark_tool_execution(iteration)

            # Add assistant message with tool calls to history (context is king!)
            self.session.history.add_assistant_message(llm_response_text)

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

    async def _handle_parse_validation_error(
        self,
        parse_recovery: ParseRecoveryPolicy,
        error: Exception,
    ) -> AsyncGenerator[AgentStreamingEvent, None]:
        """Record parser-validation failures and notify frontend."""
        logger.warning("Parser validation error: %s", error)

        error_details = str(error)
        validation_errors = getattr(error, "validation_errors", None)
        if validation_errors:
            error_details = "; ".join(validation_errors)

        error_user_message = parse_recovery.build_validation_error_user_message(
            error_details
        )
        self.session.history.add_user_message(error_user_message)

        async for event in self.event_presenter.present_error(
            f"Tool call format validation failed: {error_details}"
        ):
            yield event
