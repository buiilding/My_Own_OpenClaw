"""
Structured Prompt Model for LLM Interactions.

This module provides a structured representation of prompts, keeping components
separate until the final render step. This eliminates circular parsing patterns
and preserves data integrity.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.src.core.messages import MultimodalContentHelper
from backend.src.core.types import LLMMessage


@dataclass
class Prompt:
    """
    Structured representation of a prompt for LLM interaction.
    
    Keeps all components separate until rendering to LLMMessage format.
    This prevents data loss from string concatenation and circular parsing.
    """
    system_prompt: str
    tool_schemas: Optional[Dict[str, Any]] = None
    user_query: str = ""
    episodic_memory: List[str] = field(default_factory=list)
    semantic_memory: List[str] = field(default_factory=list)
    context_xml: str = ""
    history: List[LLMMessage] = field(default_factory=list)
    
    def render_to_llm_messages(self) -> List[LLMMessage]:
        """
        Render the prompt to LLMMessage format for LLM consumption.
        
        This is the only place where components are combined into strings.
        All other code should work with the structured Prompt object.
        
        Returns:
            List of LLMMessage dicts ready for LLM API
        """
        from backend.src.core.messages import MessageRole, MultimodalContentHelper
        
        messages: List[LLMMessage] = []
        
        # Build system message
        system_content = self.system_prompt
        
        messages.append({
            "role": MessageRole.SYSTEM.value,
            "content": system_content
        })
        
        # Prepare tool schemas content if present
        tool_schemas_content = ""
        if self.tool_schemas:
            import json
            tool_schemas_content = (
                "CRITICAL: The following list of tools are the ONLY tools available to you. Any tool not in this list DOES NOT EXIST.\n"
                "Available Tools:\n" + json.dumps(self.tool_schemas, indent=2) +
                '\n\nTOOL USAGE: When you need to use tools, call them using EXACT JSON format: '
                '{"functionCall": {"name": "tool_name", "args": {"param": "value"}}}. '
                'NEVER generate fake tool output or describe tool execution - only ACTUAL tool calls produce results.'
                "\n\n"
            )
        
        # Process history - only inject context into the LAST user query message
        # Find the last user query message (has <user_query> tag or is last USER role message)
        last_user_query_idx = -1
        for i in range(len(self.history) - 1, -1, -1):
            msg = self.history[i]
            if msg["role"] == MessageRole.USER.value:
                text_content = MultimodalContentHelper.get_text(msg["content"])
                # Check if this is a user query (has <user_query> tag) vs tool output
                if "<user_query>" in text_content:
                    last_user_query_idx = i
                    break
        
        # Process history messages
        for i, msg in enumerate(self.history):
            if msg["role"] == MessageRole.USER.value and i == last_user_query_idx:
                # This is the last user query - inject context and rebuild with memory sections
                # Build the full user message with context and memory
                # Format: context_xml + memory sections + user_query
                memory_sections = []
                if self.episodic_memory:
                    episodic_text = "\n".join(f"- {m}" for m in self.episodic_memory)
                    memory_sections.append(f"<episodic_memory>\n{episodic_text}\n</episodic_memory>")
                else:
                    memory_sections.append("<episodic_memory>\nNone\n</episodic_memory>")
                
                if self.semantic_memory:
                    semantic_text = "\n".join(f"- {m}" for m in self.semantic_memory)
                    memory_sections.append(f"<semantic_memory>\n{semantic_text}\n</semantic_memory>")
                else:
                    memory_sections.append("<semantic_memory>\nNone\n</semantic_memory>")
                
                memory_sections.append(f"<user_query>\n{self.user_query}\n</user_query>")
                
                # Combine: context + tool schemas + memory + query
                parts_to_join = []
                if self.context_xml:
                    parts_to_join.append(self.context_xml)
                if tool_schemas_content:
                    parts_to_join.append(tool_schemas_content)
                parts_to_join.extend(memory_sections)
                
                full_content = "\n\n".join(parts_to_join)
                
                # Handle multimodal content
                content = msg["content"]
                if isinstance(content, str):
                    new_content = full_content
                else:
                    # Multimodal: replace or prepend text part
                    new_content = list(content)
                    found_text = False
                    for j, part in enumerate(new_content):
                        # Use MultimodalContentHelper to check if this is a text part
                        if isinstance(part, dict) and MultimodalContentHelper.get_text(part):
                            new_content[j] = MultimodalContentHelper.create_text_content(full_content)
                            found_text = True
                            break
                    if not found_text:
                        new_content.insert(0, MultimodalContentHelper.create_text_content(full_content))
                
                messages.append({
                    "role": MessageRole.USER.value,
                    "content": new_content
                })
            else:
                # Other messages (including tool outputs) pass through unchanged
                messages.append(msg)
        
        return messages

