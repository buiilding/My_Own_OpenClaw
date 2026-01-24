"""
Agent Session Builder for Agent SDK.

Creates sub-AgentSession instances with custom configuration.
Reuses the AgentFactory pattern but adds model_id override capability.
"""
import logging
import uuid
from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.session.session import AgentSession

from backend.src.core.services.agent_factory import RestrictedToolRegistry
from backend.src.sdk.agents.config_helper import override_model_id

logger = logging.getLogger(__name__)


def build_session(
    parent_session: "AgentSession",
    model_id: str,
    system_prompt: str,
    tools: Optional[List[str]] = None,
) -> "AgentSession":
    """
    Create a sub-AgentSession with custom configuration.
    
    This function:
    1. Creates RestrictedToolRegistry (filters parent's tool registry)
    2. Overrides model_id in config
    3. Creates AgentSession with overridden config
    4. Sets system_prompt in PromptConstructor
    
    Args:
        parent_session: The parent AgentSession to inherit resources from
        model_id: The model_id to use for this agent (overrides parent's selected_model_id)
        system_prompt: Custom system prompt for the agent's personality
        tools: List of allowed tool names. If None, no tools are allowed.
        
    Returns:
        A new, configured AgentSession ready to use
    """
    # 1. Create Restricted Registry
    allowed_tools = tools or []
    restricted_registry = RestrictedToolRegistry(parent_session.tool_registry, allowed_tools)
    
    # 2. Generate a sub-session ID
    sub_session_id = f"{parent_session.session_id}_sub_{str(uuid.uuid4())[:8]}"
    
    # 3. Override model_id in config
    overridden_config = override_model_id(parent_session.cfg, model_id)
    
    # 4. Get plugin registry from parent session
    plugin_registry = parent_session.plugin_registry
    
    # 5. Create AgentSession
    sub_session = parent_session.__class__(
        cfg=overridden_config,
        tool_registry=restricted_registry,  # type: ignore
        plugin_registry=plugin_registry,
        llm_client=parent_session.llm_client,
        tool_orchestrator=parent_session.tool_orchestrator,
        event_bus=parent_session.event_bus,
        user_id=parent_session.user_id,
        session_id=sub_session_id
    )
    
    # 6. Inject System Prompt
    # Update PromptConstructor to use the custom system prompt for this agent
    sub_session.prompt_builder.system_prompt = system_prompt
    
    return sub_session
