
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, AsyncGenerator

logger = logging.getLogger(__name__)

@dataclass
class CognitiveState:
    """
    Represents the current state of the cognitive process for a single turn.
    Acts as a blackboard for steps to share data.
    """
    # Input
    user_query: str
    user_id: str
    session_id: str
    
    # Context (Perception)
    memory_context: str = ""
    retrieved_memories: Dict[str, List[str]] = field(default_factory=dict)
    
    # Thought (Cognition)
    llm_response_text: str = ""
    parsed_response: Any = None  # ParsedResponse
    
    # Action
    tool_calls: List[Any] = field(default_factory=list)
    tool_results: List[Any] = field(default_factory=list)
    
    # Status
    should_continue: bool = True  # For multi-step loops
    final_response: Optional[str] = None


class CognitiveStep(ABC):
    """
    Abstract base class for a single step in the cognitive pipeline.
    """
    
    @abstractmethod
    async def execute(self, state: CognitiveState) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Executes the step, modifying the state and yielding events.
        """
        yield

