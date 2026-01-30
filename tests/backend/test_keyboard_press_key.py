"""
Test file for keyboard Ctrl+L hotkey functionality.

This test focuses specifically on pressing Ctrl+L (focus address bar shortcut)
to verify the keyboard_control tool's hotkey functionality works correctly.
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


async def run_ctrl_l_test():
    """
    Test pressing Ctrl+L hotkey (focus address bar in browsers).
    """
    print("\n" + "="*60)
    print("TEST: CTRL+L HOTKEY (Focus Address Bar)")
    print("="*60)

    try:
        # Initialize components
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
            tool_registry=tool_registry
        )

        tool_orchestrator = ToolOrchestrator(
            tool_registry=tool_registry,
            context_factory=context_factory,
            config=config
        )

        # Create LLM response simulating Ctrl+L hotkey call
        llm_response = '{"metadata": {"explanation": "Pressing Ctrl+L to focus the address bar", "expectation": "Address bar becomes active with cursor blinking"}, "action": {"functionCall": {"name": "keyboard_control", "args": {"action": "hotkey", "keys": ["ctrl", "l"]}}}}'

        print(f"LLM Response: {llm_response}")

        # Parse the response
        parser = create_test_parser(tool_names=["keyboard_control"])
        parsed_response = await parser.parse_response(llm_response)

        if not parsed_response.has_tool_calls:
            print("❌ No tool calls found in response")
            return False

        tool_call = parsed_response.tool_calls[0]
        print(f"✅ Parsed tool call: {tool_call.tool_name} with args: {tool_call.parameters}")

        # Execute the tool
        user_id = "test_user"
        session_id = "test_session"

        orchestration_result = await tool_orchestrator.execute_tools_from_response(
            parsed_response,
            user_id=user_id,
            session_id=session_id
        )

        # Process results
        for result in orchestration_result.tool_results:
            print(f"Execution result: success={result.success}")

            if result.success:
                print(f"✅ SUCCESS: {result.result.return_display}")
                return True
            else:
                print(f"❌ FAILED: {result.result.error}")
                return False

    except Exception as e:
        print(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run the Ctrl+L hotkey test."""
    print("🎹 CTRL+L HOTKEY TEST")
    print("="*80)
    print("Testing keyboard_control tool 'hotkey' action with Ctrl+L")
    print("This shortcut focuses the address bar in most browsers")
    print("Note: These tests require a graphical environment to run properly")
    print("="*80)

    # Run the test
    try:
        success = await run_ctrl_l_test()

        # Summary
        print("\n" + "="*80)
        print("📊 TEST SUMMARY")
        print("="*80)

        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"Ctrl+L hotkey test: {status}")

        if success:
            print("🎉 Ctrl+L hotkey test passed!")
        else:
            print("⚠️  Ctrl+L hotkey test failed")

        return success

    except Exception as e:
        print(f"❌ Test suite failed with exception: {e}")
        return False


if __name__ == "__main__":
    # Run the test
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
