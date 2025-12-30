"""
Structured Prompt Model for LLM Interactions.

This module provides a structured representation of prompts.
History is stored exactly as it appears to the LLM - no dynamic injection.
"""
from typing import List

from backend.src.core.types import LLMMessage


class Prompt:
    """
    Structured representation of a prompt for LLM interaction.
    
    History already contains complete messages (system prompt + user messages with context),
    so rendering just returns it as-is.
    """
    
    def __init__(self, history: List[LLMMessage]):
        """
        Initialize prompt with complete history.
        
        Args:
            history: Complete conversation history ready for LLM consumption
        """
        self.history = history
    
    def render_to_llm_messages(self) -> List[LLMMessage]:
        """
        Render the prompt to LLMMessage format for LLM consumption.
        
        History already contains complete messages (system prompt + user messages with context),
        so we just return it as-is.
        
        Returns:
            List of LLMMessage dicts ready for LLM API
        """
        # History already includes system prompt and complete user messages
        # No dynamic injection needed - everything is stored exactly as it appears
        return self.history

