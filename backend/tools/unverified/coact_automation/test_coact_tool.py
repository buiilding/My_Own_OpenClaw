"""
Test script for CoAct-1 Computer Automation Tool.

This script initializes the server container and simulates an agent calling
the coact_automation tool. The tool uses the new Agent SDK to create sub-agents
(Orchestrator, Programmer, GUI Operator) that coordinate to execute complex tasks.

It ensures all dependencies are properly initialized before testing the tool execution.
"""
import asyncio
import logging
import sys
from pathlib import Path

# Add backend/src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from backend.src.core.bootstrap.coordinator import InitializationCoordinator
# CoAct1Args will be imported from the loaded tool instance

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Disable noisy debug logs
logging.getLogger("litellm").setLevel(logging.WARNING)
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("aiosqlite").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)


async def test_coact_tool():
    """
    Test the CoAct-1 automation tool by:
    1. Initializing the server container
    2. Loading marketplace tools
    3. Creating a parent AgentSession
    4. Getting the coact tool instance
    5. Creating a ToolContext
    6. Executing the tool with a test task
    """
    logger.info("=" * 80)
    logger.info("Starting CoAct-1 Tool Test")
    logger.info("=" * 80)
    
    # Step 1: Initialize the server container
    logger.info("\n[1/6] Initializing server container...")
    from fastapi import FastAPI
    app = FastAPI()
    
    coordinator = InitializationCoordinator()
    container, session_manager, plugin_registry = await coordinator.initialize(app)
    
    logger.info("✓ Container initialized")
    logger.info(f"  - Core tools loaded: {len(container.tool_registry.tools)}")
    logger.info(f"  - Marketplace tools available: {len(container.tool_registry.marketplace_tools)}")
    
    # Step 2: Ensure marketplace tools are loaded
    logger.info("\n[2/6] Loading marketplace tools...")
    # Point to the unverified directory where coact tool is located
    # __file__ is at: backend/tools/unverified/coact_automation/test_coact_tool.py
    # So parent.parent.parent = backend/tools/
    tools_dir = Path(__file__).parent.parent.parent
    marketplace_dir = tools_dir / "unverified"
    
    if not marketplace_dir.exists():
        logger.error(f"Marketplace directory not found: {marketplace_dir}")
        return
    
    await container.tool_registry.load_marketplace_tools(marketplace_dir)
    logger.info(f"✓ Marketplace tools loaded: {len(container.tool_registry.marketplace_tools)}")
    
    # List available marketplace tools
    for tool_name in container.tool_registry.marketplace_tools.keys():
        logger.info(f"  - {tool_name}")
    
    # Step 3: Create a parent AgentSession
    logger.info("\n[3/6] Creating parent AgentSession...")
    parent_session = container.create_agent_session(
        user_id="test_user",
        session_id="test_session_coact"
    )
    logger.info(f"✓ Parent session created: {parent_session.session_id}")
    
    # Step 4: Get the coact tool instance
    logger.info("\n[4/6] Getting CoAct-1 tool instance...")
    # The tool name in manifest.json is "coact_automation"
    tool_name = "coact_automation"
    
    # Check if tool is available
    if not container.tool_registry.is_tool_available(tool_name):
        logger.error(f"Tool '{tool_name}' is not available")
        logger.info("Available tools:")
        for name in container.tool_registry.get_tool_names():
            logger.info(f"  - {name}")
        return
    
    # Get tool instance (for marketplace tools, this loads them)
    coact_tool = await container.tool_registry.get_marketplace_tool_instance(tool_name)
    
    if coact_tool is None:
        logger.error(f"Failed to load tool '{tool_name}'")
        return
    
    logger.info(f"✓ Tool loaded: {coact_tool.name}")
    logger.info(f"  Description: {coact_tool.description}")
    
    # Step 5: Create ToolContext
    logger.info("\n[5/6] Creating ToolContext...")
    
    # Update context factory with vision service (if available)
    # Note: The coordinator uses the new Agent class directly, so AgentFactory is not needed
    if hasattr(container, 'vision_service'):
        container.context_factory.set_vision_service(container.vision_service)
    
    # Create context with parent session
    tool_context = container.context_factory.create_tool_context(
        user_id="test_user",
        session_id="test_session_coact",
        workspace_root=str(Path.cwd()),
        session_ref=parent_session,
    )
    
    # Verify context has required services
    if "session" not in tool_context.services:
        logger.error("Parent session not available in context")
        return
    
    logger.info("✓ ToolContext created with all required services")
    
    # Step 6: Execute the tool with a test task
    logger.info("\n[6/6] Executing CoAct-1 tool...")
    
    # Simple test task
    test_task = "open chrome and go to amazon.com"
    
    logger.info(f"Task: {test_task}")
    logger.info("-" * 80)
    
    try:
        # Create tool arguments using the tool's args_model (Pydantic BaseModel)
        args = coact_tool.args_model(**{"task": test_task})
        
        # Execute the tool
        result = await coact_tool.run(args, tool_context)
        
        # Display results
        logger.info("\n" + "=" * 80)
        logger.info("Tool Execution Results")
        logger.info("=" * 80)
        
        if result.get("success"):
            logger.info("✓ Task completed successfully!")
            logger.info(f"\nSummary: {result.get('summary', 'N/A')}")
            logger.info(f"Iterations: {result.get('iterations_completed', 0)}")
            
            if result.get("execution_results"):
                logger.info(f"\nExecution Results ({len(result['execution_results'])}):")
                for i, exec_result in enumerate(result["execution_results"], 1):
                    logger.info(f"  [{i}] {exec_result}")
            
            logger.info(f"\nLLM Content:\n{result.get('llm_content', 'N/A')}")
        else:
            logger.error("✗ Task failed!")
            logger.error(f"Error: {result.get('error', 'Unknown error')}")
            logger.error(f"Iterations completed: {result.get('iterations_completed', 0)}")
            
            if result.get("execution_results"):
                logger.info(f"\nExecution Results ({len(result['execution_results'])}):")
                for i, exec_result in enumerate(result["execution_results"], 1):
                    logger.info(f"  [{i}] {exec_result}")
            
            logger.error(f"\nLLM Content:\n{result.get('llm_content', 'N/A')}")
        
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"Error executing tool: {e}", exc_info=True)
    
    finally:
        logger.info("\nTest completed. Shutting down...")
        # Note: In a real scenario, you might want to properly shutdown
        # but for testing, we'll just exit


if __name__ == "__main__":
    try:
        asyncio.run(test_coact_tool())
    except KeyboardInterrupt:
        logger.info("\nTest interrupted by user")
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        sys.exit(1)

