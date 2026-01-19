"""
Test file for unified mouse_control tool that simulates the full LLM tool call pipeline.

This test demonstrates different scenarios for the unified mouse control tool:
1. Manual coordinate clicks (left, right, double)
2. OCR-based text finding and clicking
3. Vision-based element prediction and clicking
4. Mouse movement and drag operations
5. Scrolling operations
6. Error cases (missing required fields)

All scenarios simulate LLM tool call format:
{"functionCall": {"name": "mouse_control", "args": {"action": "click", "find_coordinates_by": "manual", "x": 100, "y": 200, ...}}}

The test goes through all the steps:
1. Parse the LLM response
2. Validate and execute through the tool orchestrator
3. Return the final output
"""

import asyncio
import logging
import sys
from pathlib import Path
from typing import Optional

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
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logging.getLogger('backend').setLevel(logging.INFO)


async def test_mouse_click():
    """
    Test mouse left click at specific coordinates (manual mode).
    """
    print("\n" + "="*60)
    print("TEST 1: MOUSE LEFT CLICK (MANUAL COORDINATES)")
    print("="*60)

    await run_mouse_test(action="click", find_coordinates_by="manual", x=100, y=200, expect_success=True)


async def test_mouse_right_click():
    """
    Test mouse right click action (manual mode).
    """
    print("\n" + "="*60)
    print("TEST 2: MOUSE RIGHT CLICK (MANUAL COORDINATES)")
    print("="*60)

    await run_mouse_test(action="right_click", find_coordinates_by="manual", x=150, y=250, expect_success=True)


async def test_mouse_double_click():
    """
    Test mouse double click action (manual mode).
    """
    print("\n" + "="*60)
    print("TEST 3: MOUSE DOUBLE CLICK (MANUAL COORDINATES)")
    print("="*60)

    await run_mouse_test(action="double_click", find_coordinates_by="manual", x=200, y=300, expect_success=True)


async def test_mouse_move():
    """
    Test mouse move to coordinates (manual mode).
    """
    print("\n" + "="*60)
    print("TEST 4: MOUSE MOVE TO COORDINATES (MANUAL)")
    print("="*60)

    await run_mouse_test(action="move", find_coordinates_by="manual", x=300, y=400, expect_success=True)


async def test_mouse_drag():
    """
    Test mouse drag operation (manual mode).
    """
    print("\n" + "="*60)
    print("TEST 5: MOUSE DRAG OPERATION (MANUAL)")
    print("="*60)

    await run_mouse_test(action="drag", find_coordinates_by="manual", x=400, y=500, duration=1.0, expect_success=True)


async def test_mouse_move_missing_coordinates():
    """
    Test mouse move without required coordinates (error case).
    """
    print("\n" + "="*60)
    print("TEST 6: MOUSE MOVE MISSING COORDINATES (ERROR)")
    print("="*60)

    await run_mouse_test(action="move", expect_success=False, expect_error="Coordinates")


async def test_mouse_drag_missing_coordinates():
    """
    Test mouse drag without required coordinates (error case).
    """
    print("\n" + "="*60)
    print("TEST 7: MOUSE DRAG MISSING COORDINATES (ERROR)")
    print("="*60)

    await run_mouse_test(action="drag", expect_success=False, expect_error="Coordinates")


async def test_mouse_click_ocr():
    """
    Test mouse click using OCR text finding.
    """
    print("\n" + "="*60)
    print("TEST 8: MOUSE CLICK WITH OCR TEXT SEARCH")
    print("="*60)

    await run_mouse_test(action="click", find_coordinates_by="ocr", ocr_text="Save", expect_success=True)


async def test_mouse_click_prediction():
    """
    Test mouse click using vision prediction.
    """
    print("\n" + "="*60)
    print("TEST 9: MOUSE CLICK WITH VISION PREDICTION")
    print("="*60)

    await run_mouse_test(action="click", find_coordinates_by="prediction", description="blue Save button in the top right", expect_success=True)


async def test_mouse_scroll():
    """
    Test mouse scroll operation.
    """
    print("\n" + "="*60)
    print("TEST 10: MOUSE SCROLL OPERATION")
    print("="*60)

    await run_mouse_test(action="scroll", scroll_amount=500, expect_success=True)


async def test_mouse_scroll_horizontal():
    """
    Test mouse horizontal scroll operation.
    """
    print("\n" + "="*60)
    print("TEST 11: MOUSE HORIZONTAL SCROLL")
    print("="*60)

    await run_mouse_test(action="scroll", scroll_amount=300, scroll_direction="horizontal", expect_success=True)


async def run_mouse_test(action: str, find_coordinates_by: str = "manual", x: Optional[int] = None, y: Optional[int] = None, ocr_text: Optional[str] = None, description: Optional[str] = None, scroll_amount: Optional[int] = None, scroll_direction: str = "vertical", duration: float = 0.5, expect_success: bool = True, expect_error: str = None):
    """
    Run a single mouse control test with the given parameters.
    """
    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")

    # Build args dict dynamically based on coordinate finding method
    args = {"action": action, "find_coordinates_by": find_coordinates_by}

    if find_coordinates_by == "manual":
        if x is not None:
            args["x"] = x
        if y is not None:
            args["y"] = y
    elif find_coordinates_by == "ocr":
        if ocr_text:
            args["ocr_text"] = ocr_text
    elif find_coordinates_by == "prediction":
        if description:
            args["description"] = description

    if action == "scroll":
        if scroll_amount is not None:
            args["scroll_amount"] = scroll_amount
        if scroll_direction != "vertical":
            args["scroll_direction"] = scroll_direction

    if duration != 0.5:  # Only include if not default
        args["duration"] = duration

    import json
    llm_response = json.dumps({"functionCall": {"name": "mouse_control", "args": args}})

    print(f"LLM Response: {llm_response}")

    # Step 2: Parse the Response
    print("\n📋 STEP 2: Parsing LLM Response")
    parser = create_test_parser(tool_names=["mouse_control"])
        parsed_response = await parser.parse_response(llm_response)

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

    container = None  # Initialize container to None
    try:
        # Get configuration
        config_manager = get_config_manager()
        config = config_manager.load_config()

        # Initialize container and register tools
        container = Container()
        await container.initialize()

        # Use the container's tool registry (already initialized)
        tool_registry = container.tool_registry

        # Create context factory from container
        context_factory = container.context_factory

        # Create tool orchestrator with container components
        orchestrator = ToolOrchestrator(
            tool_registry=container.tool_registry,
            config=config,
            context_factory=context_factory
        )

        print("✅ Tool orchestrator initialized successfully")

    except Exception as e:
        print(f"❌ Failed to initialize tool orchestrator: {e}")
        import traceback
        traceback.print_exc()
        # If container was initialized, try to get more debug info
        if container:
            print(f"   Container state: {'Initialized' if hasattr(container, 'tool_registry') else 'Not Initialized'}")
            print(f"   Available tools: {list(container.tool_registry.tools.keys()) if hasattr(container, 'tool_registry') else 'N/A'}")
            print(f"   Container tool registry id: {id(container.tool_registry)}")
        return

    # Step 4: Execute the tools
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
                computer_tools = {"mouse_control", "keyboard_control", "scroll_control"}
                if result.tool_call.tool_name in computer_tools:
                    print(f"\n�� STEP 5: Simulating ComputerUsePlugin Integration")

                    try:
                        # Import and create computer plugin
                        from backend.src.agent.plugins.computer import ComputerUsePlugin

                        # Create and initialize plugin with container
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
                        import traceback
                        traceback.print_exc()
                        print("   (This is expected in test environment without full system setup)")

                # Show both original and enhanced LLM content
                print(f"\n🤖 STEP 6: What gets sent back to LLM")
                print(f"Original LLM Content: {result.result.llm_content}")

                if enhanced_llm_content != result.result.llm_content:
                    print(f"Enhanced LLM Content: {enhanced_llm_content}")
                    # Truncate screenshot data for display
                    if "[SCREENSHOT]" in enhanced_llm_content:
                        screenshot_part = ""
                        # Robustly find screenshot data
                        try:
                            start_marker = "[/SCREENSHOT]"
                            screenshot_part = enhanced_llm_content.split(start_marker, 1)[1]
                            display_content = enhanced_llm_content.replace(screenshot_part, screenshot_part[:100] + "...")
                        except IndexError:
                            display_content = enhanced_llm_content # Fallback

                        print(f"LLM will receive: {display_content!r}")
                        print(f"  (Full screenshot data length: {len(screenshot_part)} characters)")
                    else:
                        print(f"LLM will receive: {enhanced_llm_content!r}")
                else:
                    print(f"LLM will receive: {enhanced_llm_content!r}")

                if result.result.return_display:
                    print(f"Display: {result.result.return_display}")
                if result.result.data:
                    print(f"Data: {result.result.data}")

                # Verify action-specific expectations (use enhanced content for validation)
                validation_content = enhanced_llm_content.lower()
                if action == "click":
                    if "left click" in validation_content:
                        print("✅ Correctly identified left click action")
                elif action == "right_click":
                    if "right click" in validation_content:
                        print("✅ Correctly identified right click action")
                elif action == "double_click":
                    if "double click" in validation_content:
                        print("✅ Correctly identified double click action")
                elif action == "move":
                    if "move" in validation_content and x is not None and y is not None:
                        if f"{x}" in validation_content and f"{y}" in validation_content:
                            print(f"✅ Correctly identified move to coordinates ({x}, {y})")
                elif action == "drag":
                    if "drag" in validation_content:
                        print("✅ Correctly identified drag action")

            else:
                print("❌ EXPECTED ERROR" if expect_error else "❌ FAILED")
                print(f"Error: {result.result.error}")
                if expect_error and expect_error in str(result.result.error):
                    print(f"✅ Correctly returned expected error: {expect_error}")

        # This block is now redundant because the content is printed above inside the loop
        # Step 6: Simulate what gets sent back to LLM
        # print("\n🤖 STEP 6: What gets sent back to LLM")

        # for result in execution_result.tool_results:
        #     llm_output = result.result.llm_content
        #     print(f"LLM will receive: {llm_output!r}")

        print("\n" + "-" * 60)

    except Exception as e:
        print(f"❌ Tool execution failed: {e}")
        import traceback
        traceback.print_exc()


async def test_mouse_control_tool_pipeline():
    """
    Run all unified mouse control test scenarios.
    """
    print("=" * 80)
    print("COMPREHENSIVE UNIFIED MOUSE CONTROL TOOL PIPELINE TEST")
    print("=" * 80)

    # Test manual coordinate actions
    await test_mouse_click()
    await test_mouse_right_click()
    await test_mouse_double_click()
    await test_mouse_move()
    await test_mouse_drag()

    # Test OCR coordinate finding
    await test_mouse_click_ocr()

    # Test prediction coordinate finding
    await test_mouse_click_prediction()

    # Test scrolling actions
    await test_mouse_scroll()
    await test_mouse_scroll_horizontal()

    # Test error cases
    await test_mouse_move_missing_coordinates()
    await test_mouse_drag_missing_coordinates()

    print("\n" + "=" * 80)
    print("ALL UNIFIED MOUSE CONTROL TOOL TESTS COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_mouse_control_tool_pipeline())
