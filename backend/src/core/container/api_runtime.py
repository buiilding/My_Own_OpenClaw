"""
API runtime binder for Container facade.
"""

from __future__ import annotations

from typing import Any, Optional

from dependency_injector import providers

from backend.src.core.container.api_container import ApiContainer


class ApiRuntimeBinder:
    """
    Owns ApiContainer lifecycle and override synchronization for Container facade.
    """

    def __init__(self, container: Any):
        self._container = container
        self._api_container: Optional[Any] = None

    def get_handler_registry(self) -> Any:
        """
        Return message handler registry, creating ApiContainer lazily.
        """
        api_container = self._ensure_api_container()
        return api_container.handler_registry()

    def refresh_overrides(self) -> None:
        """
        Refresh runtime overrides if ApiContainer has already been created.
        """
        if self._api_container is not None:
            self._reset_api_container_singletons(self._api_container)
            self._sync_api_container_overrides(self._api_container)

    def _ensure_api_container(self) -> Any:
        if self._api_container is None:
            self._api_container = ApiContainer()
            self._sync_api_container_overrides(self._api_container)
        return self._api_container

    def _sync_api_container_overrides(self, api_container: Any) -> None:
        self._reset_api_container_dependency_overrides(api_container)
        api_container.config.override(providers.Object(self._container.config))
        api_container.config_service.override(
            providers.Object(self._container.config_service)
        )
        api_container.model_service.override(
            providers.Object(self._container.model_service)
        )
        api_container.session_manager.override(
            providers.Object(self._container.session_manager)
        )

    @staticmethod
    def _reset_api_container_dependency_overrides(api_container: Any) -> None:
        for provider_name in (
            "config",
            "config_service",
            "model_service",
            "session_manager",
        ):
            provider = getattr(api_container, provider_name, None)
            reset_override = getattr(provider, "reset_override", None)
            if callable(reset_override):
                reset_override()

    @staticmethod
    def _reset_api_container_singletons(api_container: Any) -> None:
        for provider_name in (
            "handler_registry",
            "query_handler",
            "rehydrate_conversation_handler",
            "stop_query_handler",
            "tool_result_handler",
            "wakeword_handler",
            "compact_history_handler",
            "list_models_handler",
            "load_settings_handler",
            "update_settings_handler",
            "wakeword_service",
        ):
            provider = getattr(api_container, provider_name, None)
            reset = getattr(provider, "reset", None)
            if callable(reset):
                reset()
