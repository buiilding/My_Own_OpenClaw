"""
The Agent Orchestrator.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history, constructs prompts, and interacts with the
LLM client to generate responses.
"""
import asyncio
from typing import Any, AsyncGenerator, Dict, List

from backend.agent.llm_client import get_llm_client
from backend.config import AppConfig, settings

# A system prompt defines the agent's personality, capabilities, and instructions.
SYSTEM_PROMPT = """
You are a helpful and friendly desktop assistant.
Your responses should be concise, informative, and conversational.
"""

# The maximum number of messages to keep in the conversation history.
MAX_HISTORY_LENGTH = 10


class Agent:
    """The main agent class for orchestrating tasks."""

    def __init__(self, cfg: AppConfig = settings) -> None:
        """Initializes the agent."""
        self.cfg = cfg
        self.llm_client = get_llm_client(self.cfg)
        self.history: List[Dict[str, str]] = []
        self._lock = asyncio.Lock()

    def update_config(self, new_cfg: AppConfig) -> None:
        """Updates the agent's configuration and re-initializes dependencies."""
        self.cfg = new_cfg
        self.llm_client = get_llm_client(self.cfg)

    def _construct_prompt(self) -> List[Dict[str, str]]:
        """
        Constructs the full prompt to be sent to the LLM.

        The prompt includes the system prompt and all messages from history.
        The user query should be appended to history before calling this method.
        """
        prompt = [{"role": "system", "content": SYSTEM_PROMPT}]
        prompt.extend(self.history)
        return prompt

    def _prune_history(self) -> None:
        """Removes the oldest messages if the history exceeds the max length."""
        if len(self.history) > MAX_HISTORY_LENGTH:
            # Keep the most recent messages
            self.history = self.history[-MAX_HISTORY_LENGTH:]

    async def process_query(self, query: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Processes a user query and yields status updates and response chunks.

        Args:
            query: The user's input text.

        Yields:
            A dictionary with 'type' ('thinking', 'chunk') and 'content'.
        """
        await self._lock.acquire()
        try:
            # Temporarily append user query for the prompt,
            # but we'll remove it if no response
            self.history.append({"role": "user", "content": query})
            prompt = self._construct_prompt()
            full_response = ""

            try:
                # Get the structured event stream from the LLM client
                async for event in self.llm_client.get_completion_stream(
                    model=self.cfg.llm_model, messages=prompt
                ):
                    if event["type"] == "chunk":
                        full_response += event["content"]
                    # Pass all events (chunks and thinking) through to the caller
                    yield event

                # On successful completion, only append if we got a non-empty response
                if full_response:
                    self.history.append({"role": "assistant", "content": full_response})
                    self._prune_history()
                else:
                    # No response received, remove the user query we added
                    self.history.pop()
            except Exception as e:
                # On streaming failure, only append if we got some chunks
                if full_response:
                    # We got some chunks before failure, preserve partial response
                    error_msg = f"[ERROR: Streaming interrupted - {type(e).__name__}]"
                    self.history.append(
                        {
                            "role": "assistant",
                            "content": full_response + "\n\n" + error_msg,
                        }
                    )
                    self._prune_history()
                else:
                    # No chunks received, remove the user query we added
                    self.history.pop()
                # Re-raise the exception so the caller knows streaming failed
                raise
        finally:
            self._lock.release()
