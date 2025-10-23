"""
The Agent Orchestrator.

This module contains the Agent class, which is the core "brain" of the assistant.
It manages conversation history, constructs prompts, and interacts with the
LLM client to generate responses.
"""
import asyncio
from typing import AsyncGenerator, Dict, List

from backend.agent.llm_client import get_llm_client

# A system prompt defines the agent's personality, capabilities, and instructions.
SYSTEM_PROMPT = """
You are a helpful and friendly desktop assistant.
Your responses should be concise, informative, and conversational.
"""

# The maximum number of messages to keep in the conversation history.
MAX_HISTORY_LENGTH = 10


class Agent:
    """The main agent class for orchestrating tasks."""

    def __init__(self) -> None:
        """Initializes the agent."""
        self.llm_client = get_llm_client()
        self.history: List[Dict[str, str]] = []
        self._lock = asyncio.Lock()

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

    async def process_query(self, query: str) -> AsyncGenerator[str, None]:
        """
        Processes a user query and yields the streamed response from the LLM.

        Args:
            query: The user's input text.

        Yields:
            The generated response chunks as strings.
        """
        await self._lock.acquire()
        try:
            prompt = self._construct_prompt(query)
            full_response = ""

            # Get the streamed response from the LLM client
            stream = await self.llm_client.get_completion_stream(prompt)
            async for chunk in stream:
                full_response += chunk
                yield chunk

            # Add the user's query and the full assistant response to history
            self.history.append({"role": "user", "content": query})
            self.history.append({"role": "assistant", "content": full_response})
            self._prune_history()
        finally:
            self._lock.release()
