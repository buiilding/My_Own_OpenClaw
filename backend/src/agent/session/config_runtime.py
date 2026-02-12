"""Runtime config update coordination for AgentSession."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from backend.src.agent.llm.conversation_context import ConversationContext
from backend.src.llm.prompts import PromptConstructor

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession
    from backend.src.core.config import AppConfig

logger = logging.getLogger(__name__)


class SessionConfigRuntime:
    """Applies runtime config updates across session execution dependencies."""

    @staticmethod
    def apply(session: "AgentSession", new_cfg: "AppConfig") -> None:
        old_provider = session.cfg.model_provider
        old_model = session.cfg.selected_model_id
        old_mode = session.cfg.interaction_mode
        session.cfg = new_cfg

        logger.info(
            "[AgentSession] Updating config: model_provider %s -> %s, selected_model_id %s -> %s, interaction_mode %s -> %s",
            old_provider,
            new_cfg.model_provider,
            old_model,
            new_cfg.selected_model_id,
            old_mode,
            new_cfg.interaction_mode,
        )

        session.llm_client = session.llm_client_factory(session.cfg)
        session.executor.llm_client = session.llm_client
        session.executor.interaction_loop.llm_handler.llm_client = session.llm_client
        logger.info(
            "[AgentSession] LLM client recreated with provider=%s, model=%s",
            new_cfg.model_provider,
            new_cfg.selected_model_id,
        )

        previous_prompt = session.prompt_builder
        session.prompt_builder = PromptConstructor(
            session.tool_registry,
            session.cfg,
            system_prompt=previous_prompt.system_prompt,
        )

        session.executor.prompt_builder = session.prompt_builder
        session.executor.interaction_loop.prompt_coordinator = ConversationContext(
            prompt_constructor=session.prompt_builder,
            history=session.history,
        )
        logger.debug("Updated prompt constructor with new config")
