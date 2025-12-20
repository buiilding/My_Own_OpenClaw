#!/usr/bin/env python3
"""
Script to output tool schemas that are added to the agent's system message.

This script initializes the tool registry and outputs all tool schemas
in the same JSON format that would be sent to the LLM.

Usage:
    From project root: python -m backend.scripts.output_tool_schemas
    Or: python backend/scripts/output_tool_schemas.py
"""
import asyncio
import json
import sys
from pathlib import Path

# Add the codebase root to Python path before importing backend modules
# Script is at backend/scripts/output_tool_schemas.py, so go up 3 levels to project root
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))


async def main():
    """Output tool schemas in the format sent to the agent."""
    print("Initializing container and tool registry...")
    print("(Skipping vision service initialization - not needed for schema generation)")
    
    # Use lazy imports to avoid circular dependencies
    # Import Container only when needed, after path is set
    from backend.src.core.container import Container  # noqa: E402
    
    # Initialize container (this initializes the tool registry)
    container = Container()
    
    # Skip vision service initialization - we only need tool schemas, not the InternVL model
    # Temporarily override the vision service initialization method to avoid loading the model
    async def skip_vision_init():
        """Skip vision service initialization for schema generation."""
        pass  # No-op to skip model loading
    
    container._initializer._initialize_vision_service = skip_vision_init
    
    # Initialize container (without vision service)
    await container.initialize()
    
    # Get tool registry
    tool_registry = container.tool_registry
    
    # Get function declarations (same as what's sent to LLM)
    tool_schemas = tool_registry.get_function_declarations()
    
    if not tool_schemas:
        print("No tool schemas found!")
        return
    
    print(f"\nFound {len(tool_schemas)} tool schemas\n")
    print("=" * 80)
    print("TOOL SCHEMAS (as sent to agent)")
    print("=" * 80)
    print()
    
    # Output in the same format as prompt_constructor.py
    # (indented JSON, same as what gets added to system prompt)
    output = json.dumps(tool_schemas, indent=2)
    print(output)
    
    print()
    print("=" * 80)
    print(f"Total tools: {len(tool_schemas)}")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())

