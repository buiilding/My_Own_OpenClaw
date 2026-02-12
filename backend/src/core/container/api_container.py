"""
API Container for WebSocket message handlers and related dependencies.

Contains handlers, registry, TTS manager, and response formatter providers.
"""

import logging
from typing import Any

from dependency_injector import containers, providers

from backend.src.agent.session.manager import SessionManager
from backend.src.api.infrastructure.registry import MessageHandlerRegistry
from backend.src.api.handlers.query import QueryMessageHandler
from backend.src.api.handlers.rehydrate import RehydrateConversationHandler
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.api.handlers.settings import (
    LoadSettingsHandler,
    ListModelsHandler,
    UpdateSettingsHandler,
)
from backend.src.api.processing.tts.manager import TTSManager
from backend.src.api.handlers.tool_result import ToolResultHandler
from backend.src.api.handlers.wakeword import WakewordHandler
from backend.src.core.config import AppConfig
from backend.src.core.config.service import ConfigurationService
from backend.src.core.container.incoming_routing import build_handler_bindings
from backend.src.core.services.wakeword_service import WakewordService
from backend.src.llm.models import ModelService

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

    rehydrate_conversation_handler = providers.Singleton(
        RehydrateConversationHandler,
        session_manager=session_manager,
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

    list_models_handler = providers.Singleton(
        ListModelsHandler,
        model_service=model_service,
    )

    load_settings_handler = providers.Singleton(
        LoadSettingsHandler,
        session_manager=session_manager,
    )

    update_settings_handler = providers.Singleton(
        UpdateSettingsHandler,
        session_manager=session_manager,
    )

    # Handler Registry (registers all handlers)
    handler_registry = providers.Singleton(
        lambda qh, rch, trh, wh, lmh, lsh, ush: _create_handler_registry(
            qh, rch, trh, wh, lmh, lsh, ush
        ),
        qh=query_handler,
        rch=rehydrate_conversation_handler,
        trh=tool_result_handler,
        wh=wakeword_handler,
        lmh=list_models_handler,
        lsh=load_settings_handler,
        ush=update_settings_handler,
    )


def _create_handler_registry(
    query_handler: QueryMessageHandler,
    rehydrate_conversation_handler: RehydrateConversationHandler,
    tool_result_handler: ToolResultHandler,
    wakeword_handler: WakewordHandler,
    list_models_handler: ListModelsHandler,
    load_settings_handler: LoadSettingsHandler,
    update_settings_handler: UpdateSettingsHandler,
) -> MessageHandlerRegistry:
    """
    Create and register all message handlers in the registry.

    Args:
        query_handler: Query message handler
        tool_result_handler: Tool result handler
        wakeword_handler: Wakeword handler
        list_models_handler: List models handler

    Returns:
        Initialized MessageHandlerRegistry with all handlers registered
    """
    registry = MessageHandlerRegistry()

    for message_type, handler in build_handler_bindings(
        {
            "query_handler": query_handler,
            "rehydrate_conversation_handler": rehydrate_conversation_handler,
            "tool_result_handler": tool_result_handler,
            "wakeword_handler": wakeword_handler,
            "list_models_handler": list_models_handler,
            "load_settings_handler": load_settings_handler,
            "update_settings_handler": update_settings_handler,
        }
    ):
        registry.register(message_type, handler)

    # Source compatibility breadcrumb for tests migrating from manual registration:
    # registry.register("load-settings", load_settings_handler)

    logger.info("Message handler registry initialized with all handlers")
    return registry
