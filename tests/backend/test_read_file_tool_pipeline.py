"""
Test file for read_file tool that simulates the full LLM tool call pipeline.

This test simulates what happens when the LLM generates a correct tool call format:
{"functionCall": {"name": "read_file", "args": {"path": "tests/backend/test_read_file_tool_pipeline.py"}}}

The test goes through all the steps:
1. Parse the LLM response
2. Validate and execute through the tool orchestrator
3. Return the final output
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add the codebase root to Python path so backend.src imports work
codebase_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(codebase_root))

from backend.src.llm.parser import ResponseParser
from backend.src.tools.orchestrator import ToolOrchestrator
from backend.src.tools.registry import ToolRegistry
from backend.src.core.config import get_config_manager
from backend.src.core.container import Container
from backend.src.core.services.context_factory import ContextFactory

# Configure logging for the test
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def test_read_file_tool_pipeline():
    """
    Test the complete pipeline for a read_file tool call.

    Simulates what happens when the LLM outputs:
    {"functionCall": {"name": "read_file", "args": {"path": "tests/backend/test_read_file_tool_pipeline.py"}}}
    """
    print("=" * 80)
    print("TESTING READ FILE TOOL PIPELINE")
    print("=" * 80)

    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")
    llm_response = '{"functionCall": {"name": "read_file", "args": {"path": "tests/backend/test_read_file_tool_pipeline.py"}}}'

    print(f"LLM Response: {llm_response}")

    # Step 2: Parse the Response
    print("\n📋 STEP 2: Parsing LLM Response")
    parser = ResponseParser()
    parsed_response = parser.parse_response(llm_response)

    print(f"Parsed Response:")
    print(f"  - Has tool calls: {parsed_response.has_tool_calls}")
    print(f"  - Number of tool calls: {len(parsed_response.tool_calls)}")
    print(f"  - Text content: '{parsed_response.text_content}'")

    if parsed_response.tool_calls:
        for i, tool_call in enumerate(parsed_response.tool_calls, 1):
            print(f"  Tool Call {i}:")
            print(f"    - Tool name: {tool_call.tool_name}")
            print(f"    - Parameters: {tool_call.parameters}")
            print(f"    - Raw call: {tool_call.raw_call}")
            print(f"    - Confidence: {tool_call.confidence}")

    if not parsed_response.has_tool_calls:
        print("❌ No tool calls found in response!")
        return

    # Step 3: Set up Tool Orchestrator
    print("\n🏗️ STEP 3: Setting up Tool Orchestrator")

    try:
        # Get configuration
        config_manager = get_config_manager()
        config = config_manager.load_config()

        # Initialize container and register tools
        container = Container()
        await container.initialize()

        # Use the container's tool registry (already initialized)
        tool_registry = container.tool_registry

        # Create context factory
        context_factory = ContextFactory(
            config=config,
            tool_registry=container.tool_registry
        )

        # Create tool orchestrator
        orchestrator = ToolOrchestrator(
            tool_registry=tool_registry,
            config=config,
            context_factory=context_factory
        )

        print("✅ Tool orchestrator initialized successfully")

    except Exception as e:
        print(f"❌ Failed to initialize tool orchestrator: {e}")
        return

    # Step 4: Execute Tools
    print("\n🚀 STEP 4: Executing Tools")

    try:
        # Execute the tools
        execution_result = await orchestrator.execute_tools_from_response(
            parsed_response,
            user_id="test_user",
            session_id="test_session_123"
        )

        print("Execution completed!")
        print(f"Number of tool results: {len(execution_result.tool_results)}")

        # Step 5: Display Results
        print("\n📊 STEP 5: Tool Execution Results")

        for i, result in enumerate(execution_result.tool_results, 1):
            print(f"\n--- Tool Result {i} ---")
            print(f"Tool Name: {result.tool_call.tool_name}")
            print(f"Success: {result.success}")
            print(f"Execution Time: {result.execution_time:.3f}s")

            if result.success:
                print("✅ SUCCESS")
                print(f"LLM Content: {result.result.llm_content}")
                if result.result.return_display:
                    print(f"Display: {result.result.return_display}")
                if result.result.data:
                    print(f"Data: {result.result.data}")
            else:
                print("❌ FAILED")
                print(f"Error: {result.result.error}")

        # Step 6: Simulate what gets sent back to LLM
        print("\n🤖 STEP 6: What gets sent back to LLM")

        for result in execution_result.tool_results:
            llm_output = result.result.llm_content
            print(f"LLM will receive: {llm_output!r}")

        print("\n" + "=" * 80)
        print("TEST COMPLETED SUCCESSFULLY")
        print("=" * 80)

    except Exception as e:
        print(f"❌ Tool execution failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_read_file_tool_pipeline())
