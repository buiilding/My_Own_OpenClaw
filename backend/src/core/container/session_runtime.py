"""
Session runtime coordinator for Container facade.
"""

from __future__ import annotations

import threading
from typing import Any, Optional

from backend.src.core.container.session_factory import AgentSessionFactory


class SessionRuntimeCoordinator:
    """
    Owns session factory/session manager lifecycle for the Container facade.
    """

    def __init__(self, container: Any):
        self._container = container
        self._session_factory: Optional[AgentSessionFactory] = None
        self._session_manager: Optional[Any] = None
        self._session_manager_lock = threading.Lock()

    def create_agent_session(
        self,
        *,
        user_id: str = "default_user",
        session_id: Optional[str] = None,
        config: Optional[Any] = None,
    ) -> Any:
        """
        Create AgentSession instances via a lazily built AgentSessionFactory.
        """
        factory = self._get_or_create_session_factory()
        return factory.create_session(user_id=user_id, session_id=session_id, config=config)

    def get_session_manager(self) -> Any:
        """
        Return SessionManager, lazily initialized with thread-safe double-check locking.
        """
        if self._session_manager is None:
            with self._session_manager_lock:
                if self._session_manager is None:
                    from backend.src.agent.session.manager import SessionManager

                    self._session_manager = SessionManager(
                        config=self._container.config,
                        create_agent_session_func=self._container.create_agent_session,
                    )
        return self._session_manager

    def invalidate_session_factory(self) -> None:
        """
        Force recreation so future sessions use latest runtime config/dependencies.
        """
        self._session_factory = None

    def _get_or_create_session_factory(self) -> AgentSessionFactory:
        if self._session_factory is None:

            def llm_client_factory(session_config=None):
                if session_config is not None:
                    if (
                        hasattr(self._container, "_mock_llm_factory")
                        and self._container._mock_llm_factory
                    ):
                        return self._container._mock_llm_factory(session_config)

                    from backend.src.llm.client import get_llm_client

                    return get_llm_client(session_config)

                return self._container._di_container.llm_client()

            self._session_factory = AgentSessionFactory(
                config=self._container.config,
                tool_registry=self._container.tool_registry,
                ocr_service=self._container.ocr_service,
                llm_client_factory=llm_client_factory,
                tool_orchestrator_factory=lambda: self._container._di_container.tool_orchestrator(),
                event_bus=self._container._di_container.core.event_bus(),
                metrics_service=self._container._di_container.core.metrics_service(),
            )

        return self._session_factory

