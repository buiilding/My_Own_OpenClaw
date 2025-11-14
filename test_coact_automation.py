#!/usr/bin/env python3
"""
Test script for CoAct Automation Tool

This script demonstrates how to execute the coact_automation tool
in the same way that the AI agent would call it.
"""

import asyncio
import logging
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.config import AppConfig, AppServices
from backend.tools.registry import create_tool_registry
from backend.marketplace.registry import MarketplaceRegistry
from backend.tools.base import ToolContext

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_coact_automation():
    """Test the CoAct automation tool execution."""

    print("Initializing CoAct Automation Test")
    print("=" * 50)

    try:
        # 1. Set up configuration
        print("Setting up configuration...")
        config = AppConfig()
        config.memory_enabled = False  # Disable for testing

        # Create AppServices
        app_services = AppServices(config)
        print("Configuration initialized")

        # 2. Initialize marketplace
        print("Initializing marketplace...")
        marketplace_registry = MarketplaceRegistry()
        await marketplace_registry.load_marketplace_tools()
        tool_count = marketplace_registry.get_tool_count()
        print(f"Marketplace loaded with {tool_count} tools")

        # 3. Create tool registry
        print("Creating tool registry...")
        tool_registry = create_tool_registry(config)
        tool_registry.marketplace_registry = marketplace_registry
        print("Tool registry created")

        # 4. Verify CoAct tool is available
        print("Checking CoAct automation tool availability...")
        available = tool_registry.is_tool_available('coact_automation')
        if not available:
            print("CoAct automation tool not available")
            return

        print("CoAct automation tool is available")

        # 5. Execute the CoAct automation tool
        print("\nExecuting CoAct automation tool...")
        print("Task: 'Open Chrome browser'")

        # Execute the tool (same way the agent would)
        result = await tool_registry.execute_tool(
            'coact_automation',
            task='Open Chrome browser'
        )

        print("\nExecution Results:")
        print("=" * 30)
        print(f"Success: {result.success}")

        if result.success:
            print("Task completed successfully!")
            try:
                print(f"Summary: {result.llm_content}")
            except UnicodeEncodeError:
                print("Summary: [Content contains unsupported characters]")
            if result.metadata:
                print(f"Execution time: {result.metadata.get('execution_time', 'N/A')} seconds")
                print(f"Agents used: {result.metadata.get('agents_used', 'N/A')}")
                print(f"Steps completed: {result.metadata.get('steps_completed', 'N/A')}")
        else:
            print("Task failed!")
            print(f"Error: {result.error}")
            try:
                print(f"Details: {result.llm_content}")
            except UnicodeEncodeError:
                print("Details: [Content contains unsupported characters]")

        # Show any episodic memories or semantic facts
        if hasattr(result, 'episodic_memories') and result.episodic_memories:
            print(f"\nEpisodic Memories ({len(result.episodic_memories)}):")
            for memory in result.episodic_memories:
                print(f"  • {memory}")

        if hasattr(result, 'semantic_facts') and result.semantic_facts:
            print(f"\nSemantic Facts ({len(result.semantic_facts)}):")
            for fact in result.semantic_facts:
                print(f"  • {fact}")

    except Exception as e:
        print(f"Test failed with exception: {e}")
        import traceback
        traceback.print_exc()


async def test_tool_search():
    """Test searching for marketplace tools."""

    print("\nTesting marketplace tool search...")
    print("=" * 40)

    try:
        config = AppConfig()
        config.memory_enabled = False

        # Initialize marketplace
        marketplace_registry = MarketplaceRegistry()
        await marketplace_registry.load_marketplace_tools()

        # Create tool registry
        tool_registry = create_tool_registry(config)
        tool_registry.marketplace_registry = marketplace_registry

        # Search for automation tools
        from backend.tools.core.marketplace.search_marketplace_tool import SearchMarketplaceTool
        search_tool = SearchMarketplaceTool(config, None)  # No search engine needed for basic test

        # Manually search
        query = "automation"
        print(f"Searching for tools matching: '{query}'")

        # Get available tools manually
        available_tools = []
        if marketplace_registry:
            for tool_name in marketplace_registry.list_tools():
                available_tools.append({
                    'name': tool_name,
                    'description': 'Marketplace tool'
                })

        print(f"Found {len(available_tools)} marketplace tools:")
        for tool in available_tools:
            print(f"  • {tool['name']}: {tool['description']}")

    except Exception as e:
        print(f"Search test failed: {e}")


if __name__ == "__main__":
    print("CoAct Automation Tool Test Script")
    print("This script tests the CoAct automation tool execution")
    print()

    # Run the tests
    asyncio.run(test_tool_search())
    asyncio.run(test_coact_automation())

    print("\nTest script completed!")
