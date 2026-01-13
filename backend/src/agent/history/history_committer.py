"""
History Committer.

Commits processed tool results into agent conversation history.
Pure state mutation - no computation, no logic, no conditionals.
"""
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core.state import ConversationHistory
    from backend.src.agent.tools.result_transformer import ProcessedToolResult

logger = logging.getLogger(__name__)


class HistoryCommitter:
    """
    Commits processed results into agent memory.
    
    Responsibility: State mutation only.
    No computation, no logic, no conditionals, no plugins.
    """

    def __init__(self, history: "ConversationHistory"):
        """
        Initialize the history committer.
        
        Args:
            history: Conversation history to commit to
        """
        self.history = history

    def commit(self, result: "ProcessedToolResult") -> None:
        """
        Commit processed result to conversation history.
        
        Args:
            result: Processed tool result to commit
        """
        self.history.add_tool_output(
            result.formatted_message,
            result.screenshot_data
        )
