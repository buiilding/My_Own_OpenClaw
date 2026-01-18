"""
API Container for WebSocket message handlers and related dependencies.

Contains handlers, registry, TTS manager, and response formatter providers.
"""
import logging

from dependency_injector import containers, providers

from backend.src.agent.core.session_manager import SessionManager
from backend.src.api.core.base import MessageHandlerRegistry
from backend.src.api.handlers.query import QueryMessageHandler
from backend.src.api.query.formatter import ResponseFormatter
from backend.src.api.handlers.settings import (
    ListModelsHandler,
    LoadSettingsHandler,
    UpdateSettingsHandler,
)
from backend.src.api.tts.manager import TTSManager
from backend.src.api.handlers.tool_result import ToolResultHandler
from backend.src.api.handlers.wakeword import WakewordHandler
from backend.src.core.config import AppConfig
from backend.src.core.config_service import ConfigurationService
from backend.src.core.config.user_config_manager import UserConfigManager
from backend.src.core.services.wakeword_service import WakewordService
from backend.src.llm.model_service import ModelService

logger = logging.getLogger(__name__)


class ApiContainer(containers.DeclarativeContainer):
    """
    API dependency injection container.

    Provides:
    - Message handler registry
    - TTS manager
    - Response formatter
    - All WebSocket message handlers
    """

    # Wiring - these will be provided by parent container
    config = providers.Dependency()
    session_manager = providers.Dependency()
    config_service = providers.Dependency()
    user_config_manager = providers.Dependency()
    model_service = providers.Dependency()

    # TTS Manager (stateless utility)
    tts_manager = providers.Singleton(TTSManager)

    # Response Formatter (stateless utility)
    response_formatter = providers.Singleton(ResponseFormatter)

    # Wakeword Service (policy service)
    wakeword_service = providers.Singleton(
        WakewordService,
        config=config,
    )

    # Message Handlers
    query_handler = providers.Singleton(
        QueryMessageHandler,
        session_manager=session_manager,
        tts_manager=tts_manager,
        response_formatter=response_formatter,
    )

    tool_result_handler = providers.Singleton(
        ToolResultHandler,
        session_manager=session_manager,
    )

    wakeword_handler = providers.Singleton(
        WakewordHandler,
        tts_manager=tts_manager,
        wakeword_service=wakeword_service,
    )

    load_settings_handler = providers.Singleton(
        LoadSettingsHandler,
        config_service=config_service,
        user_config_manager=user_config_manager,
    )

    update_settings_handler = providers.Singleton(
        UpdateSettingsHandler,
        session_manager=session_manager,
        config_service=config_service,
        user_config_manager=user_config_manager,
    )

    list_models_handler = providers.Singleton(
        ListModelsHandler,
        model_service=model_service,
    )

    # Handler Registry (registers all handlers)
    handler_registry = providers.Singleton(
        lambda qh, trh, wh, lsh, ush, lmh: _create_handler_registry(
            qh, trh, wh, lsh, ush, lmh
        ),
        qh=query_handler,
        trh=tool_result_handler,
        wh=wakeword_handler,
        lsh=load_settings_handler,
        ush=update_settings_handler,
        lmh=list_models_handler,
    )


def _create_handler_registry(
    query_handler: QueryMessageHandler,
    tool_result_handler: ToolResultHandler,
    wakeword_handler: WakewordHandler,
    load_settings_handler: LoadSettingsHandler,
    update_settings_handler: UpdateSettingsHandler,
    list_models_handler: ListModelsHandler,
) -> MessageHandlerRegistry:
    """
    Create and register all message handlers in the registry.

    Args:
        query_handler: Query message handler
        tool_result_handler: Tool result handler
        wakeword_handler: Wakeword handler
        load_settings_handler: Load settings handler
        update_settings_handler: Update settings handler
        list_models_handler: List models handler

    Returns:
        Initialized MessageHandlerRegistry with all handlers registered
    """
    registry = MessageHandlerRegistry()

    # Register all handlers
    registry.register("query", query_handler)
    registry.register("tool-result", tool_result_handler)
    registry.register("wakeword-detected", wakeword_handler)
    registry.register("load-settings", load_settings_handler)
    registry.register("update-settings", update_settings_handler)
    registry.register("list-models", list_models_handler)

    logger.info("Message handler registry initialized with all handlers")
    return registry
