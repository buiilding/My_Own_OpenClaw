#!/usr/bin/env python3
"""
Script to output tool schemas that are added to the agent's system message.

This script directly imports tool classes and outputs their cleaned JSON schemas
in the same format that is sent to the LLM.
"""
import json
import sys
from pathlib import Path

# Add the codebase root to Python path
# Script is at backend/scripts/output_tool_schemas.py
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))

from backend.src.tools.remote import get_all_remote_tools
from backend.src.tools.schema_registry import SchemaRegistry

def main():
    """Output tool schemas in the format sent to the agent."""
    print("Loading tool definitions...")
    
    # Get all remote tools (the source of truth for LLM schemas)
    remote_tools_map = get_all_remote_tools()
    
    if not remote_tools_map:
        print("No tools found!")
        return
    
    # Instantiate tools and get their schemas
    tools = []
    for name, tool_class in remote_tools_map.items():
        try:
            tools.append(tool_class())
        except Exception as e:
            print(f"Error instantiating tool {name}: {e}")
            
    # Use SchemaRegistry to generate the final declarations
    schema_registry = SchemaRegistry()
    tool_schemas = schema_registry.get_declarations(tools)
    
    if not tool_schemas:
        print("No tool schemas generated!")
        return
    
    # Output in the same format as what's sent to the LLM
    output = json.dumps(tool_schemas, indent=2)
    print(output)
    
    print(f"\nTotal tools: {len(tool_schemas)}")

if __name__ == "__main__":
    main()
