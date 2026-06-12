"""Runtime config update coordination for AgentSession."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from backend.src.agent.llm.conversation_context import ConversationContext
from backend.src.agent.session.capability_application import (
    accepted_client_tool_names,
    merge_runtime_tools_into_prompt_policy,
)
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
            metrics_service=session.metrics_service,
        )
        session.prompt_builder.workspace_path = getattr(
            previous_prompt, "workspace_path", None
        )
        session.prompt_builder.repo_instruction_messages = list(
            getattr(previous_prompt, "repo_instruction_messages", []) or []
        )
        session.prompt_builder.client_prompt_layers = list(
            getattr(previous_prompt, "client_prompt_layers", []) or []
        )
        session.prompt_builder.client_tool_schemas = list(
            getattr(previous_prompt, "client_tool_schemas", []) or []
        )
        runtime = getattr(session, "runtime", None)
        merge_runtime_tools_into_prompt_policy(
            session.prompt_builder,
            accepted_tool_names=accepted_client_tool_names(
                getattr(runtime, "client_tool_manifest", None)
                if runtime is not None
                else None
            ),
            previous_tool_names=[],
        )

        session.executor.prompt_builder = session.prompt_builder
        session.executor.interaction_loop.prompt_coordinator = ConversationContext(
            prompt_constructor=session.prompt_builder,
            history=session.history,
        )
        logger.debug("Updated prompt constructor with new config")
