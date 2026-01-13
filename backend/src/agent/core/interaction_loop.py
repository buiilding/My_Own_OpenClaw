"""
Interaction Loop.

Controls the agent execution state machine.
Only responsible for loop control, sequencing, and termination decisions.
All content, I/O, and presentation is delegated to specialized components.
"""
import logging
from typing import TYPE_CHECKING, AsyncGenerator

from backend.src.core.events import (
    AgentStreamingEvent,
    FullResponseEvent,
)
from backend.src.core.exceptions import LLMRateLimitError

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession
    from backend.src.agent.llm.event_presenter import EventPresenter
    from backend.src.agent.llm.llm_interaction_handler import LLMInteractionHandler
    from backend.src.agent.llm.prompt_coordinator import PromptCoordinator
    from backend.src.agent.tools.tool_executor import ToolExecutor
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
        prompt_coordinator: "PromptCoordinator",
        llm_handler: "LLMInteractionHandler",
        response_parser: "ResponseParser",
        tool_executor: "ToolExecutor",
        event_presenter: "EventPresenter",
    ):
        """
        Initialize the interaction loop.
        
        Args:
            session: Agent session for state access
            prompt_coordinator: Coordinates prompt preparation
            llm_handler: Handles LLM streaming and token counting
            response_parser: Parses LLM responses
            tool_executor: Executes tools
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
        max_iterations = self.session.cfg.max_agent_iterations

        while iteration < max_iterations:
            iteration += 1

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
                async for event in self.event_presenter.present_error(
                    "Rate limit exceeded. Please wait."
                ):
                    yield event
                return
            except Exception as e:
                logger.error(f"LLM error: {e}", exc_info=True)
                async for event in self.event_presenter.present_error(
                    f"LLM error: {str(e)}"
                ):
                    yield event
                return

            # Step 3: Parse response
            parsed_response = self.response_parser.parse_response(llm_response_text)

            # Present assistant message event
            async for event in self.event_presenter.present_assistant_message(
                llm_response_text
            ):
                yield event

            # Step 4: Decision - final answer or tools?
            if not parsed_response.has_tool_calls:
                # Final answer - update history and present completion
                self.session.history.add_assistant_message(parsed_response.text_content)
                async for event in self.event_presenter.present_completion(
                    parsed_response.text_content
                ):
                    yield event
                return

            # Step 5: Tool execution path
            # Add assistant message with tool calls to history (context is king!)
            self.session.history.add_assistant_message(llm_response_text)

            # Execute tools (yields execution-time events)
            try:
                async for event in self.tool_executor.execute(parsed_response):
                    yield event

                # Process tool results
                tool_results = await self.tool_executor.process_results(parsed_response)

                # Present tool results
                async for event in self.event_presenter.present_tool_results(
                    tool_results
                ):
                    yield event

            except Exception as e:
                logger.error(f"Critical tool execution error: {e}", exc_info=True)
                async for event in self.event_presenter.present_error(
                    f"Tool execution error: {str(e)}"
                ):
                    yield event
                break

        # Max iterations reached
        if iteration >= max_iterations:
            logger.warning("Max iterations reached in agent loop.")
            async for event in self.event_presenter.present_error(
                "I reached the maximum number of steps without finishing."
            ):
                yield event
            return
