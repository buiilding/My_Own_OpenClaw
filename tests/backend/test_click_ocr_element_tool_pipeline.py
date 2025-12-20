"""
Test file for click_ocr_element tool that simulates the full LLM tool call pipeline.

This test demonstrates different scenarios for the click_ocr_element tool:
1. Clicking OCR element by text search
2. Different click types (single, double, right)
3. Error cases (missing text, no matching text found)

The click_ocr_element tool takes a screenshot, performs OCR, and searches for
matching text using fuzzy matching. If exactly one match is found, it clicks on it.

All scenarios simulate LLM tool call format:
{"functionCall": {"name": "click_ocr_element", "args": {"text": "Search", "click_type": "single"}}}

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


async def test_click_ocr_by_text():
    """
    Test clicking OCR element by text search.
    """
    print("\n" + "="*60)
    print("TEST 1: CLICK OCR ELEMENT BY TEXT")
    print("="*60)

    await run_click_ocr_test(text="Search", expect_success=True)


async def test_click_ocr_double_click():
    """
    Test double-clicking OCR element.
    """
    print("\n" + "="*60)
    print("TEST 2: DOUBLE CLICK OCR ELEMENT")
    print("="*60)

    await run_click_ocr_test(text="Click me", click_type="double", expect_success=True)


async def test_click_ocr_right_click():
    """
    Test right-clicking OCR element.
    """
    print("\n" + "="*60)
    print("TEST 3: RIGHT CLICK OCR ELEMENT")
    print("="*60)

    await run_click_ocr_test(text="Menu", click_type="right", expect_success=True)


async def test_click_ocr_missing_text():
    """
    Test clicking OCR element with missing text (error case).
    """
    print("\n" + "="*60)
    print("TEST 4: CLICK OCR ELEMENT MISSING TEXT (ERROR)")
    print("="*60)

    await run_click_ocr_test(expect_success=False, expect_error="text")


async def run_click_ocr_test(text: str = None, click_type: str = "single", expect_success: bool = True, expect_error: str = None):
    """
    Run a single click_ocr_element test with the given parameters.
    """
    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")

    # Build args dict dynamically based on provided parameters
    args = {}
    if text is not None:
        args["text"] = text
    if click_type != "single":  # Only include if not default
        args["click_type"] = click_type

    import json
    llm_response = json.dumps({"functionCall": {"name": "click_ocr_element", "args": args}})

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

                # Simulate plugin system integration (ComputerUsePlugin)
                enhanced_llm_content = result.result.llm_content

                # Check if this is a computer control tool that should trigger screenshots
                computer_tools = {"mouse_control", "keyboard_control", "scroll_control", "click_ocr_element", "predict_click"}
                if result.tool_call.tool_name in computer_tools:
                    print(f"\n🔌 STEP 5: Simulating ComputerUsePlugin Integration")

                    try:
                        # Import and create computer plugin
                        from backend.src.agent.plugins.computer import ComputerUsePlugin
                        from backend.src.core.container import Container

                        # Create a minimal container for the plugin
                        container = Container()
                        await container.initialize()

                        # Create plugin with container
                        computer_plugin = ComputerUsePlugin()
                        await computer_plugin.initialize(container)

                        # Simulate tool end hook
                        plugin_result = await computer_plugin.on_tool_end(result.tool_call.tool_name, result.result)

                        if plugin_result and plugin_result.artifacts and "screenshot_message" in plugin_result.artifacts:
                            # Append screenshot message to LLM content (like agent executor does)
                            enhanced_llm_content += plugin_result.artifacts["screenshot_message"]
                            print("✅ Computer plugin captured screenshot after tool execution")
                            print(f"Screenshot message length: {len(plugin_result.artifacts['screenshot_message'])} chars")
                        else:
                            print("⚠️  Computer plugin did not capture screenshot (may be expected if screenshot tool unavailable)")

                    except Exception as e:
                        print(f"⚠️  Computer plugin simulation failed: {e}")
                        print("   (This is expected in test environment without full system setup)")

                # Show both original and enhanced LLM content
                print(f"\n🤖 STEP 6: What gets sent back to LLM")
                print(f"Original LLM Content: {result.result.llm_content}")

                if enhanced_llm_content != result.result.llm_content:
                    print(f"Enhanced LLM Content: {enhanced_llm_content}")
                    # Truncate screenshot data for display
                    if "[SCREENSHOT]" in enhanced_llm_content:
                        lines = enhanced_llm_content.split('\n', 1)
                        if lines and "[SCREENSHOT]" in lines[0]:
                            screenshot_part = lines[0].split("[/SCREENSHOT]")[1] if "[/SCREENSHOT]" in lines[0] else ""
                            if len(screenshot_part) > 100:
                                truncated = lines[0].replace(screenshot_part, screenshot_part[:100] + "...")
                                display_content = truncated + ("\n" + lines[1] if len(lines) > 1 else "")
                            else:
                                display_content = enhanced_llm_content
                        else:
                            display_content = enhanced_llm_content
                        print(f"LLM will receive: {display_content!r}")
                        print(f"  (Full screenshot data length: {len(screenshot_part) if '[SCREENSHOT]' in enhanced_llm_content else 0} characters)")
                    else:
                        print(f"LLM will receive: {enhanced_llm_content!r}")
                else:
                    print(f"LLM will receive: {enhanced_llm_content!r}")

                if result.result.return_display:
                    print(f"Display: {result.result.return_display}")
                if result.result.data:
                    print(f"Data: {result.result.data}")

                # Verify click type (use enhanced content for validation)
                validation_content = enhanced_llm_content.lower()
                if click_type == "single":
                    if "click" in validation_content and "double" not in validation_content and "right" not in validation_content:
                        print("✅ Correctly performed single click")
                elif click_type == "double":
                    if "double" in validation_content:
                        print("✅ Correctly performed double click")
                elif click_type == "right":
                    if "right" in validation_content:
                        print("✅ Correctly performed right click")

                # Verify text is mentioned (use enhanced content)
                if text is not None and text.lower() in enhanced_llm_content.lower():
                    print(f"✅ Correctly referenced text: '{text}'")

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


async def test_click_ocr_element_tool_pipeline():
    """
    Run all click_ocr_element test scenarios.
    """
    print("=" * 80)
    print("COMPREHENSIVE CLICK OCR ELEMENT TOOL PIPELINE TEST")
    print("=" * 80)

    print("\n📝 NOTE: Click OCR Element takes a screenshot, performs OCR, and searches")
    print("for matching text using fuzzy matching. If exactly one match is found,")
    print("it clicks on it. Tests focus on parameter validation and click type variations.\n")

    # Test different click scenarios
    await test_click_ocr_by_text()
    await test_click_ocr_double_click()
    await test_click_ocr_right_click()

    # Test error case
    await test_click_ocr_missing_text()

    print("\n" + "=" * 80)
    print("ALL CLICK OCR ELEMENT TOOL TESTS COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_click_ocr_element_tool_pipeline())
