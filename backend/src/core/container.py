"""
Dependency Injection Container.

This module handles the initialization and wiring of application components.
"""
import uuid
from pathlib import Path
from typing import Optional

from backend.src.core.config import AppConfig, get_settings
from backend.src.brain.core import AgentSession
from backend.src.brain.llm.llm_client import get_llm_client
from backend.src.brain.control.orchestrator import ToolOrchestrator
from backend.src.memory.memory_manager import MemoryManager
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.loader import ToolLoader


class Container:
    """
    Dependency Injection Container for the application.
    """

    def __init__(self):
        """Initialize the container and core singletons."""
        # Load Config
        self.config = get_settings()
        
        # Initialize Tool System
        self.tool_loader = ToolLoader(self.config)
        self.tool_registry = ToolRegistry(self.config, self.tool_loader)
        
        self.tool_search_engine = None
        
        # Memory System Singletons
        self.memory_store = None
        self.embedder = None
        
        if self.config.memory_enabled:
            try:
                from backend.src.memory.storage.local_store import LocalMemoryStore
                from backend.src.memory.embeddings import SentenceTransformerProvider
                from backend.src.core.config import get_config_dir
                
                # Determine DB path
                db_path = self.config.memory_db_path
                if db_path is None:
                    config_dir = get_config_dir()
                    memory_dir = config_dir / "memory"
                    memory_dir.mkdir(parents=True, exist_ok=True)
                    db_path = str(memory_dir / "memories.db")
                
                # Initialize components
                self.embedder = SentenceTransformerProvider(model_name=self.config.embedding_model, device="cuda")
                self.memory_store = LocalMemoryStore(db_path=db_path, embedder=self.embedder)
                
            except ImportError as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to initialize memory system: {e}")
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to initialize memory store: {e}")

        # Initialize search engine if available
        try:
            from backend.src.tools.marketplace.search import ToolSearchEngine
            self.tool_search_engine = ToolSearchEngine(self.tool_registry)
            # Update registry with search engine (Optional, circular dep avoidance)
            if hasattr(self.tool_registry, "tool_search_engine"):
                self.tool_registry.tool_search_engine = self.tool_search_engine
        except ImportError:
            pass

    async def initialize(self):
        """Async initialization of components."""
        # Load marketplace tools
        project_root = Path(__file__).parent.parent.parent.parent
        marketplace_dir = project_root / "tools" / "verified"
        
        await self.tool_registry.load_marketplace_tools(marketplace_dir)
        
        # Index tools for search
        if self.tool_search_engine:
            self.tool_search_engine.index_tools()

    def update_config(self, config: AppConfig):
        """Update configuration for the container and its dependencies."""
        self.config = config
        self.tool_loader.config = config
        # Re-initialize things if needed (simplified)
        if self.tool_registry:
            self.tool_registry.config = config
        
        # Re-initialize memory if enabled status changed
        # This is a simplification; in production you might want to handle this more gracefully
        if config.memory_enabled and not self.memory_store:
             # TODO: Re-init memory store
             pass
        
    def create_agent_session(self, user_id: str = "default_user", session_id: Optional[str] = None) -> AgentSession:
        """
        Create a new AgentSession with all dependencies injected.
        
        Args:
            user_id: User identifier
            session_id: Optional session identifier (generated if not provided)
            
        Returns:
            Initialized AgentSession
        """
        if not session_id:
            session_id = str(uuid.uuid4())
            
        # Create Memory Manager Dependencies
        retrieval = None
        summarizer = None
        
        llm_client = get_llm_client(self.config)
        
        if self.memory_store and self.config.memory_enabled:
            from backend.src.memory.retrieval import SemanticRetrieval, MemorySummarizer
            
            retrieval = SemanticRetrieval(self.memory_store)
            summarizer = MemorySummarizer(
                memory_store=self.memory_store, 
                llm_client=llm_client, 
                cfg=self.config
            )
            
        memory_manager = MemoryManager(
            user_id=user_id,
            session_id=session_id,
            memory_store=self.memory_store,
            retrieval=retrieval,
            summarizer=summarizer,
            cfg=self.config
        )
        
        tool_orchestrator = ToolOrchestrator(self.tool_registry, self.config)
        
        session = AgentSession(
            cfg=self.config,
            memory_manager=memory_manager,
            tool_registry=self.tool_registry,
            llm_client=llm_client,
            tool_orchestrator=tool_orchestrator,
            user_id=user_id,
            session_id=session_id
        )
        
        return session
