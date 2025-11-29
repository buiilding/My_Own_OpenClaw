"""
SDK Agents Module.

This module defines the base Agent class, which allows developers to define specialized
agent workflows as Tools. An Agent IS-A Tool that spins up a sub-session to execute a task.
"""
import logging
from typing import List, Optional, Type, Any
from pydantic import BaseModel

from backend.src.sdk.tool import Tool, TArgs
from backend.src.sdk.context import ToolContext

logger = logging.getLogger(__name__)

class Agent(Tool[TArgs]):
    """
    An Agent is a specialized Tool that runs a conversation loop (workflow).
    
    It inherits from Tool, so it can be registered and called just like any other tool.
    However, its `run` method is pre-wired to spin up a sub-session and execute a task
    using the AgentFactory service.
    """
    
    # Subclasses must define these
    system_prompt: str
    allowed_tools: List[str]

    async def run(self, args: TArgs, ctx: ToolContext) -> dict:
        """
        Standard Tool implementation that orchestrates the agent loop.
        """
        # 1. Get AgentFactory
        if not ctx.agents:
            return {
                "success": False,
                "error": "AgentFactory service not available in context",
                "llm_content": "Error: Agent system not available"
            }

        # 2. Get Parent Session
        # The context factory puts the AgentSession object in ctx.services["session"]
        parent_session = ctx.services.get("session")
        if not parent_session:
            return {
                "success": False,
                "error": "Parent AgentSession not available in context",
                "llm_content": "Error: Context missing parent session"
            }

        # 3. Extract Task
        task_description = self.get_task_from_args(args)
        logger.info(f"Agent '{self.name}' starting task: {task_description[:50]}...")

        try:
            # 4. Create Sub-Agent Session
            agent_session = ctx.agents.create_agent(
                name=self.name,
                system_prompt=self.system_prompt,
                parent_session=parent_session,
                tools=self.allowed_tools
            )

            # 5. Run the Loop
            # We need to consume the generator to let the agent run
            # We'll accumulate the final response
            final_response = ""
            
            # Collect events (we could stream them to the parent if we wanted via callback?)
            # For now, we just wait for completion.
            async for event in agent_session.process_query(task_description):
                if event["type"] == "error":
                    logger.error(f"Agent '{self.name}' error: {event.get('content')}")
                    return {
                        "success": False,
                        "error": f"Agent execution error: {event.get('content')}",
                        "llm_content": f"Agent Error: {event.get('content')}"
                    }
            
            # 6. Retrieve Final Answer
            # The agent's last message in history should be the answer
            history = agent_session.history.get_history()
            if history and history[-1]["role"] == "assistant":
                final_response = history[-1].get("content", "")
                # Handle multimodal content list if necessary (usually text for response)
                if isinstance(final_response, list):
                    # Extract text parts
                    text_parts = [p["text"] for p in final_response if p.get("type") == "text"]
                    final_response = "".join(text_parts)
            else:
                final_response = "Agent finished without a final response."

            return {
                "success": True,
                "llm_content": final_response,
                "return_display": final_response
            }

        except Exception as e:
            logger.error(f"Agent '{self.name}' failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "llm_content": f"Agent Execution Failed: {str(e)}"
            }

    def get_task_from_args(self, args: TArgs) -> str:
        """
        Helper to extract the main instruction string from the arguments.
        Developers can override this if their args are complex.
        """
        # Default strategies to find the "prompt"
        for attr in ['task', 'query', 'instruction', 'topic', 'question', 'prompt']:
            if hasattr(args, attr):
                val = getattr(args, attr)
                if isinstance(val, str):
                    return val
        
        # Fallback: string representation
        return str(args.model_dump())

