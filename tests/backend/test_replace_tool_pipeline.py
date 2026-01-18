"""
Test file for replace tool that simulates the full LLM tool call pipeline.

This test demonstrates TWO scenarios:
1. Multiple occurrences error: Shows safety behavior when text appears multiple times
2. Successful replacement: Shows successful replacement when text appears exactly once

Both scenarios simulate LLM tool call format:
{"functionCall": {"name": "replace", "args": {"file_path": "test_temp.txt", "old_string": "old text", "new_string": "new text"}}}

The test goes through all the steps:
1. Parse the LLM response
2. Validate and execute through the tool orchestrator
3. Return the final output
"""

import asyncio
import logging
import sys
import tempfile
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
from test_parser_helpers import create_test_parser

# Configure logging for the test
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def test_replace_tool_multiple_matches():
    """
    Test replace tool behavior when text appears multiple times.
    Should return error asking for more unique context.
    """
    print("\n" + "="*60)
    print("TEST 1: MULTIPLE MATCHES ERROR")
    print("="*60)

    # Create a temporary file with multiple occurrences
    temp_file_path = "test_replace_multiple.txt"
    with open(temp_file_path, 'w') as f:
        f.write("This is old text that needs to be replaced.\nThis is old text again.\n")

    print(f"Created test file with content: {Path(temp_file_path).read_text()!r}")

    await run_replace_test(temp_file_path, "old text", "new text", expect_error=True)

    # Clean up
    try:
        Path(temp_file_path).unlink(missing_ok=True)
    except:
        pass


async def test_replace_tool_success():
    """
    Test replace tool behavior when text appears exactly once.
    Should successfully perform the replacement.
    """
    print("\n" + "="*60)
    print("TEST 2: SUCCESSFUL REPLACEMENT")
    print("="*60)

    # Create a temporary file with single occurrence
    temp_file_path = "test_replace_single.txt"
    with open(temp_file_path, 'w') as f:
        f.write("This is old text that needs to be replaced.\nThis is some other text.\n")

    print(f"Created test file with content: {Path(temp_file_path).read_text()!r}")

    await run_replace_test(temp_file_path, "old text", "new text", expect_error=False)

    # Clean up
    try:
        Path(temp_file_path).unlink(missing_ok=True)
    except:
        pass


async def run_replace_test(temp_file_path: str, old_string: str, new_string: str, expect_error: bool):
    """
    Run a single replace test with the given parameters.
    """
    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")
    llm_response = f'{{"functionCall": {{"name": "replace", "args": {{"file_path": "{temp_file_path}", "old_string": "{old_string}", "new_string": "{new_string}"}}}}}}'

    print(f"LLM Response: {llm_response}")

    # Step 2: Parse the Response
    print("\n📋 STEP 2: Parsing LLM Response")
    parser = create_test_parser(tool_names=["replace"])
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

                # Verify the replacement actually worked
                if not expect_error and Path(temp_file_path).exists():
                    final_content = Path(temp_file_path).read_text()
                    print(f"File content after replacement: {final_content!r}")
                    if new_string in final_content and old_string not in final_content:
                        print(f"✅ Replacement verified: '{old_string}' was successfully replaced with '{new_string}'")
                    else:
                        print("⚠️  Replacement may not have worked as expected")
            else:
                print("❌ EXPECTED ERROR" if expect_error else "❌ FAILED")
                print(f"Error: {result.result.error}")
                if expect_error and "Multiple matches found" in str(result.result.error):
                    print("✅ Correctly detected multiple matches and asked for clarification")

        # Step 6: Simulate what gets sent back to LLM
        print("\n🤖 STEP 6: What gets sent back to LLM")

        for result in execution_result.tool_results:
            llm_output = result.result.llm_content
            print(f"LLM will receive: {llm_output!r}")

        print("\n" + "-" * 60)

    except Exception as e:
        print(f"❌ Tool execution failed: {e}")
        import traceback
        traceback.print_exc()


async def test_replace_tool_pipeline():
    """
    Test the complete pipeline for replace tool calls with both scenarios.

    Demonstrates what happens when the LLM generates replace tool calls:
    1. Multiple matches error scenario
    2. Successful replacement scenario
    """
    print("=" * 80)
    print("COMPREHENSIVE REPLACE TOOL PIPELINE TEST")
    print("=" * 80)

    # Test 1: Multiple matches should fail with error
    await test_replace_tool_multiple_matches()

    # Test 2: Single match should succeed
    await test_replace_tool_success()

    print("\n" + "=" * 80)
    print("ALL REPLACE TOOL TESTS COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_replace_tool_pipeline())
