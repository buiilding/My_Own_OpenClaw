import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from backend.src.tools.tool_policy import ToolPolicy

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StartupStep:
    """Declarative startup step contract for container-owned runtime services."""

    name: str
    initialize: Callable[["ContainerInitializer"], Awaitable[None]]
    enabled: Optional[Callable[["ContainerInitializer"], bool]] = None
    on_disabled: Optional[Callable[["ContainerInitializer"], None]] = None
    publish_to_context_factory: Optional[Callable[["ContainerInitializer"], None]] = None


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
        self._tool_policy = ToolPolicy.from_config(getattr(container, "config", None))
        self._startup_steps = {
            step.name: step for step in self._build_startup_steps()
        }

    async def initialize(self) -> None:
        """
        Perform async initialization of container components.

        This includes:
        - Configuration service initialization
        - Vision service initialization for fast first-time use
        - OCR service initialization for fast first-time use
        - Publishing vision/OCR services into the shared context factory
        """
        # Initialize configuration service (loads config and makes it available)
        for step_name in self._startup_steps:
            await self._run_startup_step(step_name)

        logger.info("Container initialization complete")

    def _build_startup_steps(self) -> list[StartupStep]:
        return [
            StartupStep(
                name="config_service",
                initialize=ContainerInitializer._run_config_service_step,
            ),
            StartupStep(
                name="vision_service",
                initialize=ContainerInitializer._run_vision_service_step,
                enabled=lambda initializer: initializer._should_initialize_vision_service(),
                publish_to_context_factory=ContainerInitializer._publish_vision_service,
            ),
            StartupStep(
                name="ocr_service",
                initialize=ContainerInitializer._run_ocr_service_step,
                enabled=lambda initializer: initializer._should_initialize_ocr_service(),
                on_disabled=lambda initializer: initializer._disable_ocr_service(),
                publish_to_context_factory=ContainerInitializer._publish_ocr_service,
            ),
            StartupStep(name="embedder", initialize=ContainerInitializer._run_embedder_step),
        ]

    def _get_startup_step(self, name: str) -> StartupStep:
        return self._startup_steps[name]

    async def _run_startup_step(self, name: str) -> None:
        step = self._get_startup_step(name)
        if step.enabled is not None and not step.enabled(self):
            if step.on_disabled is not None:
                step.on_disabled(self)
            logger.info("Skipping %s startup step (disabled)", step.name)
            return
        await step.initialize(self)
        if step.publish_to_context_factory is not None:
            step.publish_to_context_factory(self)

    def _should_initialize_vision_service(self) -> bool:
        """Return whether vision startup initialization should run."""
        return self._tool_policy.should_initialize_vision()

    def _should_initialize_ocr_service(self) -> bool:
        """Return whether OCR startup initialization should run."""
        return self._tool_policy.should_initialize_ocr()

    async def _initialize_config_service(self) -> None:
        await self._run_startup_step("config_service")

    async def _run_config_service_step(self) -> None:
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
        await self._run_startup_step("vision_service")

    async def _run_vision_service_step(self) -> None:
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
        await self._run_startup_step("embedder")

    async def _run_embedder_step(self) -> None:
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

    async def _initialize_ocr_service(self) -> None:
        await self._run_startup_step("ocr_service")

    async def _run_ocr_service_step(self) -> None:
        """
        Initialize the OCR service to pre-load the RapidOCR engine.
        """
        try:
            ocr_service = self.container.ocr_service

            if ocr_service is None:
                logger.warning("OCR service not available in DI container")
                return

            await ocr_service.initialize()
            if getattr(ocr_service, "is_ready", getattr(ocr_service, "enabled", False)):
                logger.info("OCR service initialized successfully")
            elif getattr(ocr_service, "enabled", False):
                logger.warning("OCR service initialization completed but engine is not ready")
            else:
                logger.warning("OCR service initialized but disabled (dependencies missing)")

        except ImportError as e:
            logger.warning(f"OCR service dependencies not available: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize OCR service: {e}", exc_info=True)

    def _disable_ocr_service(self) -> None:
        ocr_service = getattr(self.container, "ocr_service", None)
        if ocr_service is not None and hasattr(ocr_service, "enabled"):
            ocr_service.enabled = False


    def _publish_vision_service(self) -> None:
        context_factory = getattr(self.container, "context_factory", None)
        vision_service = getattr(self.container, "vision_service", None)
        if context_factory is not None and vision_service is not None:
            context_factory.set_vision_service(vision_service)

    def _publish_ocr_service(self) -> None:
        context_factory = getattr(self.container, "context_factory", None)
        ocr_service = getattr(self.container, "ocr_service", None)
        if context_factory is not None and ocr_service is not None:
            context_factory.set_ocr_service(ocr_service)
