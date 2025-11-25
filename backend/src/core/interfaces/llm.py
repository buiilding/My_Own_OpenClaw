"""
LLM Client Interface.

This module defines the Protocol interface for LLM client implementations,
allowing different LLM providers to be used interchangeably.
"""
from typing import Protocol, List, Dict, Any, AsyncGenerator, Optional, runtime_checkable

@runtime_checkable
class LLMClientInterface(Protocol):
    """Interface for LLM interactions."""
    
    async def generate_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Generate a complete response."""
        ...

    async def generate_stream(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate a streaming response."""
        ...

