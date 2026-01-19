"""
Container Initializer.

Handles async initialization of container components including vision service initialization.
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


class ContainerInitializer:
    """
    Handles async initialization of container components.

    Separates initialization logic from DI container configuration.
    """

    def __init__(self, container: Any):
        """
        Initialize the container initializer.

        Args:
            container: Container instance to initialize
        """
        self.container = container

    async def initialize(self) -> None:
        """
        Perform async initialization of container components.

        This includes:
        - Configuration service initialization
        - Vision service initialization (for fast first-time use)
        - Setting vision service in context factory
        """
        # Initialize configuration service (loads config and makes it available)
        await self._initialize_config_service()

        # Initialize vision service (pre-loads InternVL model for fast first-time use)
        await self._initialize_vision_service()

        # Initialize embedder (loads SentenceTransformer model in thread pool)
        await self._initialize_embedder()

        # Set vision service in context factory so tools can access it
        if self.container.vision_service is not None:
            self.container.context_factory.set_vision_service(self.container.vision_service)

        logger.info("Container initialization complete")

    async def _initialize_config_service(self) -> None:
        """
        Initialize the configuration service by loading configuration.
        
        This ensures ConfigurationService is ready to use after container initialization.
        """
        try:
            # Get config service from DI container
            config_service = self.container._di_container.core.config_service()
            
            if config_service is None:
                logger.warning("Configuration service not available in DI container")
                return

            # Initialize the service (loads config)
            config_service.initialize()
            logger.info("Configuration service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize configuration service: {e}", exc_info=True)

    async def _initialize_vision_service(self) -> None:
        """
        Initialize the vision service to pre-load the InternVL model.
        
        This enables fast first-time use in mouse_control tool with find_coordinates_by="prediction" without
        waiting for model initialization during tool execution.
        
        The vision service is obtained from the DI container and initialized.
        """
        try:
            # Get vision service from DI container
            vision_service = self.container.vision_service
            
            if vision_service is None:
                logger.warning("Vision service not available in DI container")
                return

            initialized = await vision_service.initialize()

            if initialized:
                logger.info("Vision service initialized successfully")
            else:
                logger.warning(
                    f"Vision service initialization failed: {vision_service.initialization_error}"
                )

        except ImportError as e:
            logger.warning(f"Vision service dependencies not available: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize vision service: {e}", exc_info=True)

    async def _initialize_embedder(self) -> None:
        """
        Initialize the embedder to pre-load the SentenceTransformer model.
        
        This enables fast first-time use in memory operations without waiting
        for model initialization during embedding generation. Model loading is
        offloaded to a thread pool to prevent blocking application startup.
        """
        try:
            # Get embedder from DI container
            embedder = self.container.embedder
            
            if embedder is None:
                logger.debug("Embedder not available (memory may be disabled)")
                return

            # Check if embedder has initialize method (SentenceTransformerProvider)
            if hasattr(embedder, 'initialize'):
                await embedder.initialize()
                logger.info("Embedder initialized successfully")
            else:
                logger.debug("Embedder does not require async initialization")

        except ImportError as e:
            logger.warning(f"Embedder dependencies not available: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize embedder: {e}", exc_info=True)
