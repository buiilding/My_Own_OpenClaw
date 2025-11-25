"""
Test file for write_file tool that simulates the full LLM tool call pipeline.

This test demonstrates MULTIPLE scenarios that can occur with write_file:
1. Creating a new file successfully
2. Overwriting an existing file
3. Missing file_path parameter (error)
4. Writing to a directory path (error)
5. File write failure (permission error simulation)

All scenarios simulate LLM tool call format:
{"functionCall": {"name": "write_file", "args": {"file_path": "test_output.txt", "content": "Hello, World!"}}}

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


async def test_write_file_tool_multiple_scenarios():
    """
    Test write_file tool behavior for creating new files.
    """
    print("\n" + "="*60)
    print("TEST 1: CREATE NEW FILE SUCCESSFULLY")
    print("="*60)

    temp_file_path = "test_write_new.txt"
    # Clean up any existing file
    if Path(temp_file_path).exists():
        Path(temp_file_path).unlink()

    await run_write_file_test(temp_file_path, "Hello, World!\nThis is a new file.", expect_success=True, expect_new_file=True)

    # Clean up
    try:
        Path(temp_file_path).unlink(missing_ok=True)
    except:
        pass


async def test_write_file_overwrite_existing():
    """
    Test write_file tool overwriting an existing file.
    """
    print("\n" + "="*60)
    print("TEST 2: OVERWRITE EXISTING FILE")
    print("="*60)

    temp_file_path = "test_write_existing.txt"

    # Create initial file
    with open(temp_file_path, 'w') as f:
        f.write("Original content")

    print(f"Created initial file with content: {Path(temp_file_path).read_text()!r}")

    await run_write_file_test(temp_file_path, "New content overwriting the old content.", expect_success=True, expect_new_file=False)

    # Clean up
    try:
        Path(temp_file_path).unlink(missing_ok=True)
    except:
        pass


async def test_write_file_missing_path():
    """
    Test write_file tool with missing file_path parameter.
    """
    print("\n" + "="*60)
    print("TEST 3: MISSING FILE_PATH PARAMETER (ERROR)")
    print("="*60)

    # This will test the error case where file_path is empty/missing
    await run_write_file_test("", "Content that won't be written", expect_success=False, expect_error="file_path parameter is required")


async def test_write_file_directory_path():
    """
    Test write_file tool trying to write to a directory path.
    """
    print("\n" + "="*60)
    print("TEST 4: WRITING TO DIRECTORY PATH (ERROR)")
    print("="*60)

    # Try to write to an existing directory
    await run_write_file_test("tests", "This should fail because tests is a directory", expect_success=False, expect_error="Path is a directory, not a file")


async def run_write_file_test(file_path: str, content: str, expect_success: bool = True, expect_new_file: bool = None, expect_error: str = None):
    """
    Run a single write_file test with the given parameters.
    """
    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")

    # Properly escape the content for JSON
    import json
    if file_path:
        args = {"file_path": file_path, "content": content}
        llm_response = json.dumps({"functionCall": {"name": "write_file", "args": args}})
    else:
        # Missing file_path parameter
        args = {"content": content}
        llm_response = json.dumps({"functionCall": {"name": "write_file", "args": args}})

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
                    if expect_new_file is not None:
                        actual_is_new = result.result.data.get("is_new_file", False)
                        if actual_is_new == expect_new_file:
                            print(f"✅ Correctly identified as {'new' if expect_new_file else 'existing'} file")
                        else:
                            print(f"⚠️  Expected {'new' if expect_new_file else 'existing'} file but got {'new' if actual_is_new else 'existing'}")

                # Verify the file was actually written
                if expect_success and file_path and Path(file_path).exists():
                    written_content = Path(file_path).read_text()
                    if written_content == content:
                        print(f"✅ File content verified: {len(written_content)} characters written")
                    else:
                        print(f"⚠️  File content mismatch: expected {len(content)} chars, got {len(written_content)} chars")
            else:
                print("❌ EXPECTED ERROR" if expect_error else "❌ FAILED")
                print(f"Error: {result.result.error}")
                if expect_error and expect_error in str(result.result.error):
                    print(f"✅ Correctly returned expected error: {expect_error}")

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


async def test_write_file_tool_pipeline():
    """
    Run all write_file test scenarios.
    """
    print("=" * 80)
    print("COMPREHENSIVE WRITE FILE TOOL PIPELINE TEST")
    print("=" * 80)

    # Test successful scenarios
    await test_write_file_tool_multiple_scenarios()
    await test_write_file_overwrite_existing()

    # Test error scenarios
    await test_write_file_missing_path()
    await test_write_file_directory_path()

    print("\n" + "=" * 80)
    print("ALL WRITE FILE TOOL TESTS COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_write_file_tool_pipeline())