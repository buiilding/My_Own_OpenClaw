"""Session config and frontend OS state helpers for SessionManager."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Callable, Optional

from backend.src.core.config import AppConfig

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.agent.session.session_registry import SessionRegistry

logger = logging.getLogger(__name__)


class SessionConfigService:
    """Own user overrides, frontend OS state, and effective-session config assembly."""

    def __init__(
        self,
        *,
        base_config: AppConfig,
        registry: "SessionRegistry",
        assemble_runtime_session_config: Callable[[AppConfig], AppConfig],
        render_system_prompt: Callable[[Optional[str]], str],
    ) -> None:
        self._base_config = base_config
        self._registry = registry
        self._assemble_runtime_session_config = assemble_runtime_session_config
        self._render_system_prompt = render_system_prompt
        self.user_config_overrides: dict[str, dict[str, Any]] = {}
        self.frontend_operating_systems: dict[str, str] = {}

    def set_base_config(self, config: AppConfig) -> None:
        self._base_config = config

    def build_effective_config(
        self,
        user_id: str,
        *,
        base_config: Optional[AppConfig] = None,
    ) -> AppConfig:
        config_dict = (base_config or self._base_config).model_dump()
        overrides = self.user_config_overrides.get(user_id, {})
        for key, value in overrides.items():
            if value is not None:
                config_dict[key] = value
        return self._assemble_runtime_session_config(AppConfig(**config_dict))

    def get_effective_config(self, user_id: str) -> AppConfig:
        return self.build_effective_config(user_id)

    @staticmethod
    def normalize_frontend_operating_system(
        operating_system: Optional[str],
    ) -> Optional[str]:
        if not isinstance(operating_system, str):
            return None
        normalized = operating_system.strip()
        return normalized or None

    def apply_frontend_operating_system_to_session(
        self,
        session: "AgentSession",
        operating_system: str,
    ) -> None:
        rendered_prompt = self._render_system_prompt(operating_system)
        session.prompt_builder.system_prompt = rendered_prompt
        session.history.system_prompt = rendered_prompt

    def set_frontend_operating_system(
        self,
        user_id: str,
        operating_system: Optional[str],
    ) -> None:
        normalized_operating_system = self.normalize_frontend_operating_system(
            operating_system
        )
        if normalized_operating_system is None:
            return
        self.frontend_operating_systems[user_id] = normalized_operating_system
        for _, session in self._registry.iter_user_sessions(user_id):
            self.apply_frontend_operating_system_to_session(
                session,
                normalized_operating_system,
            )

    async def update_session_config(
        self,
        user_id: str,
        updates: dict[str, Any],
    ) -> None:
        if not updates:
            return

        overrides = self.user_config_overrides.setdefault(user_id, {})
        changed_override_keys = False
        for key, value in updates.items():
            if value is None:
                continue
            if overrides.get(key) != value:
                overrides[key] = value
                changed_override_keys = True

        user_sessions = self._registry.get_user_sessions(user_id)
        if not user_sessions:
            if not changed_override_keys:
                return
            return

        user_lock = await self._registry.get_user_lock(user_id)
        async with user_lock:
            user_sessions = self._registry.get_user_sessions(user_id)
            if not user_sessions:
                return

            updated_config = self.build_effective_config(user_id)
            sessions_needing_update = [
                session
                for session in user_sessions.values()
                if session.cfg.model_dump() != updated_config.model_dump()
            ]
            if not sessions_needing_update:
                return

            for session in sessions_needing_update:
                await session.update_config(updated_config)

    async def update_all_sessions_config(self, config: AppConfig) -> None:
        self.set_base_config(config)
        errors: list[tuple[str, Exception]] = []
        for user_id in self._registry.iter_user_ids():
            user_lock = await self._registry.get_user_lock(user_id)
            async with user_lock:
                user_sessions = self._registry.get_user_sessions(user_id)
                if not user_sessions:
                    continue
                updated_config = self.build_effective_config(user_id, base_config=config)
                for session in user_sessions.values():
                    try:
                        await session.update_config(updated_config)
                    except Exception as exc:
                        logger.error(
                            "Error updating config for user %s session: %s",
                            user_id,
                            exc,
                            exc_info=True,
                        )
                        errors.append((user_id, exc))
        if errors:
            logger.warning("Failed to update config for %s session(s)", len(errors))

    def clear_user_state(self, user_id: str) -> None:
        self.frontend_operating_systems.pop(user_id, None)
        self.user_config_overrides.pop(user_id, None)
