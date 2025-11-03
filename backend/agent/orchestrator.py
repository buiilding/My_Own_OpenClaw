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
        self.llm_client = get_llm_client(cfg)
        self.history: List[Dict[str, str]] = []
        self._lock = asyncio.Lock()
        self.cfg = cfg

    def _construct_prompt(self, query: str) -> List[Dict[str, str]]:
        """Constructs the full prompt to be sent to the LLM."""
        prompt = [{"role": "system", "content": SYSTEM_PROMPT}]
        prompt.extend(self.history)
        prompt.append({"role": "user", "content": query})
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
            prompt = self._construct_prompt(query)
            full_response = ""

            # Get the structured event stream from the LLM client
            async for event in self.llm_client.get_completion_stream(
                model=self.cfg.llm_model, messages=prompt
            ):
                if event["type"] == "chunk":
                    full_response += event["content"]
                # Pass all events (chunks and thinking) through to the caller
                yield event

            # Add the user's query and the full assistant response to history
            self.history.append({"role": "user", "content": query})
            self.history.append({"role": "assistant", "content": full_response})
            self._prune_history()
        finally:
            self._lock.release()
