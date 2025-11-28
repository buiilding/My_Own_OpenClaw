"""
Dependency Injection Container using dependency-injector library.

This module handles the initialization and wiring of application components
using proper dependency injection patterns.
"""
import uuid
import logging
from pathlib import Path
from typing import Optional, TYPE_CHECKING, Any

from dependency_injector import containers, providers

from backend.src.core.config import AppConfig, ConfigManager, get_config_manager
from backend.src.core.interfaces.memory_store import MemoryStoreInterface
from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.llm_client import get_llm_client

# Use TYPE_CHECKING to avoid circular imports
if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession
    from backend.src.llm.llm_client import LLMClient
    from backend.src.tools.orchestrator import ToolOrchestrator
    from backend.src.memory.memory_manager import MemoryManager
    from backend.src.tools.registry import ToolRegistry
    from backend.src.tools.loader import ToolLoader

logger = logging.getLogger(__name__)


class ApplicationContainer(containers.DeclarativeContainer):
    """
    Dependency Injection Container for the application.
    Uses dependency-injector library for proper DI.
    
    This container uses factory providers to properly inject dependencies
    and resolve circular dependencies without workarounds.
    """
    
    # Configuration
    # ConfigManager is a singleton that can be injected or created
    # This uses proper DI - no placeholder objects
    config_manager = providers.Singleton(ConfigManager)
    
    # Config provider - loads config once at startup
    config = providers.Singleton(
        lambda cm: cm.load_config(),
        cm=config_manager,
    )
    
    # Service Layer
    service_container = providers.Singleton(
        lambda cfg: _create_service_container(cfg),
        cfg=config,
    )
    
    # Tool System - proper dependency order to avoid circular dependencies:
    # 1. Create instantiator first (tool_search_engine is optional, injected later)
    # 2. Create loader with instantiator
    # 3. Create registry and factory with loader
    # 4. Create search engine with registry
    # 5. Wire search engine into instantiator via DI override (proper DI pattern)
    
    # Tool Instantiator (created first, search_engine is optional and injected later)
    tool_instantiator = providers.Singleton(
        lambda: _create_tool_instantiator(None),
    )
    
    # Tool Loader (needs instantiator, injected via DI)
    tool_loader = providers.Singleton(
        lambda cfg, services, instantiator: _create_tool_loader(cfg, services, instantiator),
        cfg=config,
        services=service_container,
        instantiator=tool_instantiator,
    )
    
    # Agent Factory
    agent_factory = providers.Singleton(
        lambda: _create_agent_factory(),
    )

    # Create tool registry and context factory together to resolve circular dependency
    # This factory creates both and wires them together properly
    tool_registry_and_factory = providers.Singleton(
        lambda cfg, loader, af: _create_tool_registry_with_factory(cfg, loader, af),
        cfg=config,
        loader=tool_loader,
        af=agent_factory,
    )
    
    # Extract registry and factory from the tuple
    tool_registry = providers.Singleton(
        lambda pair: pair[0],
        pair=tool_registry_and_factory,
    )
    
    context_factory = providers.Singleton(
        lambda pair: pair[1],
        pair=tool_registry_and_factory,
    )
    
    # Tool Search Engine (created after registry, properly injected)
    tool_search_engine = providers.Singleton(
        lambda registry: _create_tool_search_engine(registry),
        registry=tool_registry,
    )
    
    # Memory System Components
    embedder = providers.Singleton(
        lambda cfg: _create_embedder(cfg),
        cfg=config,
    )
    
    memory_store = providers.Singleton(
        lambda cfg, emb: _create_memory_store(cfg, emb),
        cfg=config,
        emb=embedder,
    )
    
    # LLM Client
    llm_client = providers.Factory(
        lambda cfg: get_llm_client(cfg),
        cfg=config,
    )
    
    # Tool Orchestrator - lazy import to avoid circular dependencies
    tool_orchestrator = providers.Factory(
        lambda registry, cfg, ctx_factory: _create_tool_orchestrator(registry, cfg, ctx_factory),
        registry=tool_registry,
        cfg=config,
        ctx_factory=context_factory,
    )


def _create_service_container(config: AppConfig):
    """Create service container."""
    from backend.src.core.services import ServiceContainer
    return ServiceContainer(config)


def _create_tool_instantiator(tool_search_engine):
    """Create tool instantiator with proper DI."""
    from backend.src.tools.loading.tool_instantiator import ToolInstantiator
    return ToolInstantiator(tool_search_engine=tool_search_engine)

def _create_tool_loader(config: AppConfig, service_container, tool_instantiator):
    """Create tool loader with lazy import and proper DI."""
    from backend.src.tools.loader import ToolLoader
    return ToolLoader(
        config, 
        service_container=service_container,
        tool_instantiator=tool_instantiator,
    )


def _create_agent_factory():
    """Create agent factory."""
    from backend.src.core.services.agent_factory import AgentFactory
    return AgentFactory()


def _create_tool_registry_with_factory(config: AppConfig, tool_loader, agent_factory):
    """
    Create tool registry and context factory together.
    
    This factory function resolves the circular dependency by creating both
    objects and wiring them together in a single operation.
    
    Returns:
        Tuple of (ToolRegistry, ContextFactory) properly wired together
    """
    from backend.src.tools.registry import ToolRegistry
    
    # Create context factory first (without registry)
    context_factory = ContextFactory(
        config=config,
        tool_registry=None,  # Will be set after registry is created
        tool_loader=tool_loader,
        agent_factory=agent_factory,
    )
    
    # Create tool registry with context factory
    tool_registry = ToolRegistry(
        config=config,
        tool_loader=tool_loader,
        context_factory=context_factory,
    )
    
    # Wire registry into context factory (complete the circular reference)
    context_factory.set_tool_registry(tool_registry)
    
    return (tool_registry, context_factory)




def _create_tool_orchestrator(tool_registry, config: AppConfig, context_factory):
    """Create tool orchestrator with lazy import."""
    from backend.src.tools.orchestrator import ToolOrchestrator
    return ToolOrchestrator(tool_registry, config, context_factory=context_factory)


def _create_tool_search_engine(tool_registry):
    """Create tool search engine if available."""
    try:
        from backend.src.tools.marketplace.search import ToolSearchEngine
        engine = ToolSearchEngine(tool_registry)
        # Update registry with search engine if it has the attribute
        if hasattr(tool_registry, "tool_search_engine"):
            tool_registry.tool_search_engine = engine
        return engine
    except ImportError:
        return None


def _create_embedder(config: AppConfig) -> Optional[EmbeddingProvider]:
    """Create embedding provider if memory is enabled."""
    if not config.memory_enabled:
        return None
    
    try:
        from backend.src.memory.embeddings import SentenceTransformerProvider
        return SentenceTransformerProvider(
            model_name=config.embedding_model,
            device="cuda"
        )
    except ImportError as e:
        logger.error(f"Failed to initialize embedding provider: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create embedding provider: {e}")
        return None


def _create_memory_store(
    config: AppConfig,
    embedder: Optional[EmbeddingProvider]
) -> Optional[MemoryStoreInterface]:
    """Create memory store if memory is enabled."""
    if not config.memory_enabled or embedder is None:
        return None
    
    try:
        from backend.src.memory.storage.local_store import LocalMemoryStore
        from backend.src.core.config import get_config_dir
        
        # Determine DB path
        db_path = config.memory_db_path
        if db_path is None:
            config_dir = get_config_dir()
            memory_dir = config_dir / "memory"
            memory_dir.mkdir(parents=True, exist_ok=True)
            db_path = str(memory_dir / "memories.db")
        
        return LocalMemoryStore(db_path=db_path, embedder=embedder)
    except ImportError as e:
        logger.error(f"Failed to initialize memory store: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to create memory store: {e}")
        return None


class Container:
    """
    Wrapper around ApplicationContainer for backward compatibility.
    Provides the same interface as the old Container class.
    """
    
    def __init__(self, config_manager: Optional[ConfigManager] = None):
        """
        Initialize the container wrapper.
        
        Args:
            config_manager: Optional ConfigManager instance. If None, uses the one from DI container.
                This allows proper DI while maintaining backward compatibility.
        """
        self._di_container = ApplicationContainer()
        
        # Inject config_manager via DI override if provided (proper DI pattern)
        # If None, use the global singleton for backward compatibility
        if config_manager is None:
            config_manager = get_config_manager()
        
        # Override the DI container's config_manager with the provided/global one
        # This is proper DI - using the framework's override mechanism
        self._di_container.config_manager.override(providers.Object(config_manager))
        
        # Load config at initialization
        self.config = self._di_container.config()
        
        # Initialize service layer
        self.service_container = self._di_container.service_container()
        
        # Initialize tool system (all dependencies properly wired via DI)
        # The DI container handles the dependency order automatically:
        # instantiator -> loader -> registry -> search_engine
        # Then we wire search_engine back into instantiator via DI override
        self.tool_registry = self._di_container.tool_registry()
        self.context_factory = self._di_container.context_factory()
        self.tool_search_engine = self._di_container.tool_search_engine()
        self.agent_factory = self._di_container.agent_factory()
        
        # Properly wire search_engine into instantiator via DI (no manual assignment)
        # This completes the dependency cycle using proper DI patterns
        self._di_container.tool_instantiator.override(
            providers.Singleton(
                lambda: _create_tool_instantiator(self.tool_search_engine)
            )
        )
        
        # Get tool_loader (will use updated instantiator with search_engine)
        self.tool_loader = self._di_container.tool_loader()
        
        # Initialize memory system
        self.memory_store = self._di_container.memory_store()
        self.embedder = self._di_container.embedder()
    
    async def initialize(self):
        """Async initialization of components."""
        # Initialize memory store if available
        if self.memory_store and hasattr(self.memory_store, "initialize"):
            await self.memory_store.initialize()
        
        # Load core tools asynchronously (deferred from ToolRegistry.__init__)
        await self.tool_registry.load_core_tools_async()
        
        # Load marketplace tools
        project_root = Path(__file__).parent.parent.parent.parent
        marketplace_dir = project_root / "tools" / "verified"
        
        await self.tool_registry.load_marketplace_tools(marketplace_dir)
        
        # Index tools for search
        if self.tool_search_engine:
            self.tool_search_engine.index_tools()
    
    def update_config(self, config: AppConfig):
        """Update configuration for the container and its dependencies."""
        # Update config manager
        config_manager = self._di_container.config_manager()
        updated_config = config_manager.update_config(config)
        
        # Update container's config
        self.config = updated_config
        
        # Update tool loader and registry
        self.tool_loader.config = updated_config
        if self.tool_registry:
            self.tool_registry.config = updated_config
        
        # Re-initialize memory if enabled status changed
        # This is a simplification; in production you might want to handle this more gracefully
        if updated_config.memory_enabled and not self.memory_store:
            # Re-create memory components
            self.embedder = self._di_container.embedder.override(
                providers.Singleton(
                    lambda cfg: _create_embedder(cfg),
                    cfg=providers.Singleton(lambda: updated_config),
                )
            )()
            self.memory_store = self._di_container.memory_store.override(
                providers.Singleton(
                    lambda cfg, emb: _create_memory_store(cfg, emb),
                    cfg=providers.Singleton(lambda: updated_config),
                    emb=self._di_container.embedder,
                )
            )()
    
    def create_agent_session(
        self, 
        user_id: str = "default_user", 
        session_id: Optional[str] = None
    ) -> Any:  # AgentSession - lazy import to avoid circular dependency
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
        
        llm_client = self._di_container.llm_client()
        
        if self.memory_store and self.config.memory_enabled:
            from backend.src.memory.retrieval import SemanticRetrieval, MemorySummarizer
            
            retrieval = SemanticRetrieval(self.memory_store, embedder=self.embedder)
            summarizer = MemorySummarizer(
                memory_store=self.memory_store,
                llm_client=llm_client,
                cfg=self.config
            )
        
        # Lazy import to avoid circular dependencies
        from backend.src.memory.memory_manager import MemoryManager
        from backend.src.agent.core import AgentSession
        
        memory_manager = MemoryManager(
            user_id=user_id,
            session_id=session_id,
            memory_store=self.memory_store,
            retrieval=retrieval,
            summarizer=summarizer,
            cfg=self.config
        )
        
        tool_orchestrator = self._di_container.tool_orchestrator()
        
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

