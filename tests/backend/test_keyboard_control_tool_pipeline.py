"""
Test file for keyboard_control tool that simulates the full LLM tool call pipeline.

This test demonstrates different scenarios for the keyboard control tool:
1. Typing text
2. Pressing individual keys
3. Keyboard shortcuts/hotkeys
4. Error cases (missing required parameters)

All scenarios simulate LLM tool call format (computer-use tools require metadata):
{"metadata": {"explanation": "...", "expectation": "..."}, "action": {"functionCall": {"name": "keyboard_control", "args": {"action": "type", "text": "Hello World"}}}}

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
from test_parser_helpers import create_test_parser

# Configure logging for the test
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def test_keyboard_type_text():
    """
    Test keyboard typing text.
    """
    print("\n" + "="*60)
    print("TEST 1: KEYBOARD TYPE TEXT")
    print("="*60)

    await run_keyboard_test(action="type", text="Hello, World! This is a test message.", expect_success=True)


async def test_keyboard_press_key():
    """
    Test keyboard pressing individual key.
    """
    print("\n" + "="*60)
    print("TEST 2: KEYBOARD PRESS SINGLE KEY")
    print("="*60)

    await run_keyboard_test(action="press", key="enter", expect_success=True)


async def test_keyboard_hotkey():
    """
    Test keyboard hotkey/shortcut.
    """
    print("\n" + "="*60)
    print("TEST 3: KEYBOARD HOTKEY/SHORTCUT")
    print("="*60)

    await run_keyboard_test(action="hotkey", keys=["ctrl", "c"], expect_success=True)


async def test_keyboard_type_missing_text():
    """
    Test keyboard type action missing required text parameter (error case).
    """
    print("\n" + "="*60)
    print("TEST 4: TYPE ACTION MISSING TEXT (ERROR)")
    print("="*60)

    await run_keyboard_test(action="type", expect_success=False, expect_error="text")


async def test_keyboard_press_missing_key():
    """
    Test keyboard press action missing required key parameter (error case).
    """
    print("\n" + "="*60)
    print("TEST 5: PRESS ACTION MISSING KEY (ERROR)")
    print("="*60)

    await run_keyboard_test(action="press", expect_success=False, expect_error="key")


async def test_keyboard_hotkey_missing_keys():
    """
    Test keyboard hotkey action missing required keys parameter (error case).
    """
    print("\n" + "="*60)
    print("TEST 6: HOTKEY ACTION MISSING KEYS (ERROR)")
    print("="*60)

    await run_keyboard_test(action="hotkey", expect_success=False, expect_error="keys")


async def run_keyboard_test(action: str, text: str = None, key: str = None, keys: list = None, expect_success: bool = True, expect_error: str = None):
    """
    Run a single keyboard control test with the given parameters.
    """
    # Step 1: Simulate LLM Response
    print("\n🔧 STEP 1: Simulating LLM Response")

    # Build args dict dynamically based on provided parameters
    args = {"action": action}
    if text is not None:
        args["text"] = text
    if key is not None:
        args["key"] = key
    if keys is not None:
        args["keys"] = keys

    import json
    llm_response = json.dumps({
        "metadata": {
            "explanation": "Performing keyboard action for testing",
            "expectation": "Keyboard action completes successfully"
        },
        "action": {"functionCall": {"name": "keyboard_control", "args": args}}
    })

    print(f"LLM Response: {llm_response}")

    # Step 2: Parse the Response
    print("\n📋 STEP 2: Parsing LLM Response")
    parser = create_test_parser(tool_names=["keyboard_control"])
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

                # Verify action-specific expectations (use enhanced content for validation)
                validation_content = enhanced_llm_content.lower()
                if action == "type" and text:
                    if "typed" in validation_content and text in validation_content:
                        print(f"✅ Correctly typed text: '{text}'")
                elif action == "press" and key:
                    if key.lower() in validation_content:
                        print(f"✅ Correctly pressed key: '{key}'")
                elif action == "hotkey" and keys:
                    hotkey_str = "+".join(keys)
                    if hotkey_str.lower() in validation_content:
                        print(f"✅ Correctly executed hotkey: '{hotkey_str}'")

            else:
                print("❌ EXPECTED ERROR" if expect_error else "❌ FAILED")
                print(f"Error: {result.result.error}")
                if expect_error and expect_error in str(result.result.error):
                    print(f"✅ Correctly returned expected error for missing: {expect_error}")

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


async def test_keyboard_control_tool_pipeline():
    """
    Run all keyboard control test scenarios.
    """
    print("=" * 80)
    print("COMPREHENSIVE KEYBOARD CONTROL TOOL PIPELINE TEST")
    print("=" * 80)

    # Test different keyboard actions
    await test_keyboard_type_text()
    await test_keyboard_press_key()
    await test_keyboard_hotkey()

    # Test error cases
    await test_keyboard_type_missing_text()
    await test_keyboard_press_missing_key()
    await test_keyboard_hotkey_missing_keys()

    print("\n" + "=" * 80)
    print("ALL KEYBOARD CONTROL TOOL TESTS COMPLETED")
    print("=" * 80)


if __name__ == "__main__":
    # Run the test
    asyncio.run(test_keyboard_control_tool_pipeline())
