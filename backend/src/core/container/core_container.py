"""
Core Container for basic application dependencies.

Contains configuration, service layer, LLM client, TTS service, and EventBus providers.
"""
import logging

from dependency_injector import containers, providers

from backend.src.core.bus import EventBus
from backend.src.core.config import ConfigManager
from backend.src.core.container.factories import (
    _create_tts_service,
    _create_vision_service,
)
from backend.src.llm.llm_client import get_llm_client

logger = logging.getLogger(__name__)


class CoreContainer(containers.DeclarativeContainer):
    """
    Core dependency injection container.

    Provides:
    - Configuration management
    - Service layer
    - LLM client
    - TTS service
    - EventBus (for decoupled component communication)
    """

    # Configuration
    config_manager = providers.Singleton(ConfigManager)

    # Config provider - loads config once at startup
    config = providers.Singleton(
        lambda cm: cm.load_config(),
        cm=config_manager,
    )

    # Event Bus (singleton for application-wide event communication)
    event_bus = providers.Singleton(EventBus)

    # LLM Client
    llm_client = providers.Factory(
        lambda cfg: get_llm_client(cfg),
        cfg=config,
    )

    # TTS Service
    tts_service = providers.Singleton(
        lambda cfg: _create_tts_service(cfg),
        cfg=config,
    )

    # Vision Service (initialized asynchronously during container initialization)
    vision_service = providers.Singleton(
        _create_vision_service,
        config=config,
    )
