import asyncio
import logging
import os
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Add the project root to sys.path
# Assuming this script is run from backend/scripts/
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, ".."))
sys.path.insert(0, project_root)

try:
    from src.tools.computer.computer_interface import ComputerInterface
except ImportError:
    # Try alternate import path if run from codebase root
    sys.path.insert(0, os.path.join(project_root, "backend"))
    from src.tools.computer.computer_interface import ComputerInterface


async def main():
    logger.info("Starting scroll test script...")
    
    # Initialize the computer interface
    # Disable safety for the test script to avoid blocking on confirmation keys if any
    computer = ComputerInterface(safety_enabled=False)
    
    logger.info("Initializing computer interface...")
    success = await computer.initialize()
    if not success:
        logger.error("Failed to initialize computer interface")
        return

    # Get screen size to confirm initialization worked
    screen_size = await computer.get_screen_size()
    logger.info(f"Screen size: {screen_size}")

    logger.info("Preparing to scroll in 3 seconds. Please focus a scrollable window...")
    await asyncio.sleep(3)

    # Scroll Down
    # On Windows, 120 is equivalent to 1 physical "tick" or "nudge" of the mouse wheel
    ONE_TICK = 120
    
    # Scroll down 3 ticks (standard 3-line scroll)
    clicks_down = 3 * ONE_TICK
    logger.info(f"Scrolling down {clicks_down} units (3 ticks)...")
    result_down = await computer.scroll_down(clicks=clicks_down)
    
    if result_down.success:
        logger.info(f"Scroll down success: {result_down.message}")
    else:
        logger.error(f"Scroll down failed: {result_down.error}")

    await asyncio.sleep(1)

    # Scroll Up
    # Scroll up 1 tick
    clicks_up = 1 * ONE_TICK
    logger.info(f"Scrolling up {clicks_up} units (1 tick)...")
    result_up = await computer.scroll_up(clicks=clicks_up)
    
    if result_up.success:
        logger.info(f"Scroll up success: {result_up.message}")
    else:
        logger.error(f"Scroll up failed: {result_up.error}")

    logger.info("Scroll test completed.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Script interrupted by user")
    except Exception as e:
        logger.exception(f"An unexpected error occurred: {e}")
