"""
Response Extractor for Agent SDK.

Extracts final response text from agent session execution.
"""
import logging
from typing import TYPE_CHECKING

from backend.src.core.events.streaming_events import (
    ChunkEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
    StreamingEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.types.enums import ContentType

if TYPE_CHECKING:
    from backend.src.agent.core.core import AgentSession

logger = logging.getLogger(__name__)


async def extract_response(
    session: "AgentSession",
    query: str,
    image_data: str | None = None,
    collect_tool_calls: bool = False,
) -> str | tuple[str, list[dict]]:
    """
    Run a query through the agent session and extract the final response text.
    
    This function:
    1. Runs process_query() and collects all events
    2. Waits for the agent's tool loop to complete (when agent stops calling tools)
    3. The agent loop continues as long as the agent keeps calling tools
    4. Extracts final assistant message from conversation history
    5. Returns plain string (or tuple with tool calls if collect_tool_calls=True)
    
    The agent loop will continue calling tools until:
    - The agent decides not to call more tools (emits streaming-complete)
    - An error occurs
    - Max iterations reached
    
    Args:
        session: The AgentSession to execute the query on
        query: The text query to send to the agent
        image_data: Optional base64-encoded image data
        collect_tool_calls: If True, also return list of tool calls made
        
    Returns:
        The final response text as a plain string, or tuple (response, tool_calls) if collect_tool_calls=True
    """
    # Run the query and collect events
    # The agent loop will continue as long as the agent keeps calling tools
    # streaming-complete is only emitted when the agent decides to stop calling tools
    final_response = ""
    tool_calls = []
    last_tool_call_iteration = 0
    iteration_count = 0
    
    async for event in session.process_query(query, image_data=image_data):
        iteration_count += 1
        
        # Use isinstance checks for type-safe event handling
        if isinstance(event, ChunkEvent):
            # Accumulate streaming chunks
            final_response += event.content
        elif isinstance(event, FullResponseEvent):
            # Use full response if provided (this is the LLM's response for this iteration)
            if event.content:
                # Don't overwrite if we already have accumulated chunks
                if not final_response:
                    final_response = event.content
        elif isinstance(event, ToolCallEvent):
            # Agent is calling a tool - the loop will continue
            if collect_tool_calls:
                tool_calls.append({
                    "tool": event.tool_name,
                    "parameters": event.parameters,
                })
            last_tool_call_iteration = iteration_count
            logger.info(f"🔧 Agent called tool: {event.tool_name} (event #{iteration_count})")
        elif isinstance(event, ToolOutputEvent):
            # Tool execution completed - agent will see results and decide next action
            # The agent loop will continue to the next iteration where it sees these results
            logger.info(f"📥 Tool output received: {event.tool_name} - agent will see this and decide next action")
        elif isinstance(event, StreamingCompleteEvent):
            # Agent decided to stop calling tools - this is the final response
            logger.info(f"✅ Agent completed tool loop after {iteration_count} events, last tool call at event #{last_tool_call_iteration}, total tools called: {len(tool_calls)}")
            # Log the final response text that caused the agent to stop
            if final_response:
                logger.info(f"📝 Agent's final response (no more tool calls): {final_response[:500]}{'...' if len(final_response) > 500 else ''}")
            break
        elif isinstance(event, ErrorEvent):
            # Error occurred, return error message
            error_content = event.content
            logger.error(f"Agent session error: {error_content}")
            if collect_tool_calls:
                return (f"Error: {error_content}", tool_calls)
            return f"Error: {error_content}"
        elif isinstance(event, dict):
            # Backward compatibility with dict events
            event_type = event.get("type")
            if event_type == "chunk":
                content = event.get("content", "")
                final_response += content
            elif event_type == "full_response":
                content = event.get("content", "")
                if content and not final_response:
                    final_response = content
            elif event_type == "tool_call":
                if collect_tool_calls:
                    tool_calls.append({
                        "tool": event.get("tool_name"),
                        "parameters": event.get("parameters", {}),
                    })
                last_tool_call_iteration = iteration_count
                logger.info(f"🔧 Agent called tool: {event.get('tool_name')} (event #{iteration_count})")
            elif event_type == "tool_output":
                logger.info(f"📥 Tool output received: {event.get('tool_name')} - agent will see this and decide next action")
            elif event_type == "streaming-complete":
                logger.info(f"✅ Agent completed tool loop after {iteration_count} events, last tool call at event #{last_tool_call_iteration}, total tools called: {len(tool_calls)}")
                if final_response:
                    logger.info(f"📝 Agent's final response (no more tool calls): {final_response[:500]}{'...' if len(final_response) > 500 else ''}")
                break
            elif event_type == "error":
                error_content = event.get("content", "Unknown error")
                logger.error(f"Agent session error: {error_content}")
                if collect_tool_calls:
                    return (f"Error: {error_content}", tool_calls)
                return f"Error: {error_content}"
    
    # If we didn't get a response from events, extract from conversation history
    if not final_response:
        history = session.history.get_history()
        if history:
            # Get the last assistant message
            for msg in reversed(history):
                if msg.get("role") == "assistant":
                    content = msg.get("content", "")
                    # Handle multimodal content
                    if isinstance(content, list):
                        # Extract text parts
                        text_parts = [
                            p.get("text", "") for p in content if p.get("type") == ContentType.TEXT.value
                        ]
                        final_response = "".join(text_parts)
                    elif isinstance(content, str):
                        final_response = content
                    break
        
        # Log the final response if we extracted it from history
        if final_response:
            logger.info(f"📝 Agent's final response (extracted from history): {final_response[:500]}{'...' if len(final_response) > 500 else ''}")
    
    # Return final response or default message
    response = final_response if final_response else "Agent finished without a response."
    
    # Log if no response was found
    if not final_response:
        logger.warning("⚠️ Agent completed tool loop but provided no final response text")
    
    if collect_tool_calls:
        return (response, tool_calls)
    return response

