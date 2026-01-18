#!/usr/bin/env python3
"""
Script to output the exact system prompt given to the assistant.

This script initializes the prompt constructor and outputs the complete system prompt
that would be sent to the LLM, including tool schemas and all placeholder replacements.

Usage:
    From project root: python -m backend.scripts.output_system_prompt
    Or: python backend/scripts/output_system_prompt.py
"""

import asyncio
import json
import sys
from pathlib import Path

# Add the codebase root to Python path before importing backend modules
# Script is at backend/scripts/output_system_prompt.py, so go up 3 levels to project root
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))


async def main():
    """Output the complete system prompt as sent to the agent."""
    print("Initializing container and prompt constructor...")
    print("(Skipping vision service initialization - not needed for prompt generation)")

    # Use lazy imports to avoid circular dependencies
    # Import components only when needed, after path is set
    from backend.src.core.container import Container  # noqa: E402
    from backend.src.llm.prompts import PromptConstructor  # noqa: E402

    # Initialize container (this initializes the tool registry)
    container = Container()

    # Skip vision service initialization - we only need the prompt, not the InternVL model
    # Temporarily override the vision service initialization method to avoid loading the model
    async def skip_vision_init():
        """Skip vision service initialization for prompt generation."""
        pass  # No-op to skip model loading

    container._initializer._initialize_vision_service = skip_vision_init

    # Initialize container (without vision service)
    await container.initialize()

    # Get tool registry and config, create prompt constructor
    tool_registry = container.tool_registry
    config = container.config()
    prompt_constructor = PromptConstructor(
        tool_registry=tool_registry,
        config=config,
    )

    # Create a minimal history for prompt building (empty since we only want the system message)
    from backend.src.agent.state import ConversationHistory  # noqa: E402
    history = ConversationHistory()

    # Build prompt with tools included (this is how it's sent to the LLM on first message)
    prompt_messages, tool_schemas, prompt_metadata = prompt_constructor.build_prompt(
        stored_messages=history,  # Pass history object
        include_tools=True  # This includes tool schemas at the start
    )

    # Extract the system message (first message in the prompt)
    if prompt_messages and len(prompt_messages) > 0:
        system_message = prompt_messages[0]
        if system_message.get("role") == "system":
            system_content = system_message.get("content", "")

            print("\n" + "=" * 80)
            print("SYSTEM PROMPT (as sent to agent)")
            print("=" * 80)
            print()

            # Output the complete system prompt
            print(system_content)

            print("\n" + "=" * 80)
            print("SYSTEM PROMPT ANALYSIS")
            print("=" * 80)

            # Check for OS replacement
            if "{os}" in system_content:
                print("❌ ERROR: {os} placeholder was NOT replaced!")
            else:
                import re
                os_match = re.search(r'Operating system: (\w+)', system_content)
                if os_match:
                    print(f"✅ OS correctly replaced: {os_match.group(1)}")
                else:
                    print("⚠️  OS replacement not found in expected format")

            # Check for tool schemas
            if "Available Tools:" in system_content:
                # Count tool schemas
                tool_schemas_match = re.search(r'Available Tools:\s*\n(\[.*?\n\])', system_content, re.DOTALL)
                if tool_schemas_match:
                    try:
                        tools_json = tool_schemas_match.group(1)
                        tools_data = json.loads(tools_json)
                        print(f"✅ Tool schemas included: {len(tools_data)} tools")
                    except json.JSONDecodeError:
                        print("❌ Tool schemas JSON is malformed")
                else:
                    print("⚠️  Tool schemas section found but could not parse count")
            else:
                print("❌ ERROR: Tool schemas not found in system prompt!")

            print("=" * 80)
        else:
            print("❌ ERROR: First message is not a system message!")
    else:
        print("❌ ERROR: No prompt messages generated!")


if __name__ == "__main__":
    asyncio.run(main())
