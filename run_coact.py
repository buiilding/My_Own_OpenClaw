#!/usr/bin/env python3
"""
Simple script to run CoAct automation tool

Usage:
    python run_coact.py "Open Chrome browser and navigate to google.com"
"""

import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.config import AppConfig
from backend.tools.registry import create_tool_registry
from backend.marketplace.registry import MarketplaceRegistry


async def run_coact_automation(task: str):
    """Execute the CoAct automation tool with the given task."""

    print(f"Executing CoAct automation task: '{task}'")

    try:
        # Set up configuration
        config = AppConfig()
        config.memory_enabled = False

        # Initialize marketplace
        marketplace_registry = MarketplaceRegistry()
        await marketplace_registry.load_marketplace_tools()

        # Create tool registry
        tool_registry = create_tool_registry(config)
        tool_registry.marketplace_registry = marketplace_registry

        # Execute the tool
        result = await tool_registry.execute_tool('coact_automation', task=task)

        print(f"Result: {'SUCCESS' if result.success else 'FAILED'}")
        if result.success:
            try:
                print(f"Output: {result.llm_content}")
            except UnicodeEncodeError:
                print("Output: [Contains unsupported characters]")
        else:
            print(f"Error: {result.error}")

        return result

    except Exception as e:
        print(f"Exception: {e}")
        return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_coact.py 'your task description'")
        print("Example: python run_coact.py 'Open Chrome browser'")
        sys.exit(1)

    task = sys.argv[1]
    result = asyncio.run(run_coact_automation(task))
