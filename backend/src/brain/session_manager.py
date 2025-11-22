from typing import Dict, Optional
import logging
import asyncio
from backend.src.brain.core import AgentSession
from backend.src.core.container import Container
from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)

class SessionManager:
    """
    Manages the lifecycle of user sessions.
    """
    def __init__(self, container: Container):
        self.container = container
        self.active_sessions: Dict[str, AgentSession] = {}

    async def get_or_create_session(self, user_id: str) -> AgentSession:
        """
        Retrieves an existing session or creates a new one if it doesn't exist.
        """
        if user_id not in self.active_sessions:
            logger.info(f"Creating new session for user {user_id}")
            self.active_sessions[user_id] = self.container.create_agent_session(user_id=user_id)
        return self.active_sessions[user_id]

    def get_session(self, user_id: str) -> Optional[AgentSession]:
        """
        Retrieves an active session for a user.
        """
        return self.active_sessions.get(user_id)

    async def end_session(self, user_id: str):
        """
        Ends a user's session and performs cleanup.
        """
        if user_id in self.active_sessions:
            logger.info(f"Ending session for user {user_id}")
            session = self.active_sessions[user_id]
            
            # Trigger summarization if enabled
            if session.memory_manager.summarizer:
                asyncio.create_task(session.memory_manager.summarize_and_store_semantic_memory())
                
            del self.active_sessions[user_id]

    async def update_all_sessions_config(self, config: AppConfig):
        """
        Updates the configuration for all active sessions.
        """
        # Update container config for future sessions
        self.container.update_config(config)
        
        for session in self.active_sessions.values():
            await session.update_config(config)
            
    async def run_summarization_periodically(self):
        """
        Periodically run the summarization process for all active sessions.
        """
        while True:
            try:
                # Get interval from config (check periodically as config might change)
                interval = self.container.config.summarization_interval
                await asyncio.sleep(interval)
                
                logger.info("Running periodic memory summarization")
                
                # Create a copy of values to iterate safely
                current_sessions = list(self.active_sessions.values())
                
                for session in current_sessions:
                    if session.memory_manager.summarizer:
                        await session.memory_manager.summarize_and_store_semantic_memory()
                        
            except asyncio.CancelledError:
                logger.info("Summarization task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in periodic summarization: {e}", exc_info=True)
                await asyncio.sleep(60) # Wait a bit before retrying if error occurs

