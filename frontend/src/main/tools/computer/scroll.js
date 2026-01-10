/**
 * Scroll Control Tool - Node.js implementation using nut-js
 */

const { mouse, Point } = require('@nut-tree/nut-js');

/**
 * Execute scroll control action
 */
async function executeScrollControl(args, skipAutoCapture) {
  const { action, x, y, clicks = 3, direction } = args;

  try {
    switch (action) {
      case 'scroll':
        if (!direction) {
          return { success: false, error: 'direction required for scroll action' };
        }

        // Move to position first if coordinates provided
        if (x !== null && x !== undefined && y !== null && y !== undefined) {
          await mouse.setPosition(new Point(x, y));
        }

        // Convert direction to scroll amount
        // Positive clicks for up/left, negative for down/right
        const scrollAmount = direction === 'up' || direction === 'left' ? clicks : -clicks;

        // Scroll vertically or horizontally
        if (direction === 'up' || direction === 'down') {
          await mouse.scrollY(scrollAmount);
        } else if (direction === 'left' || direction === 'right') {
          await mouse.scrollX(scrollAmount);
        }

        return {
          success: true,
          data: {
            action: 'scroll',
            clicks,
            coordinates: x !== null && y !== null ? [x, y] : null,
            direction,
            message: `Scrolled ${direction} ${clicks} clicks`,
            llm_content: `Scrolled ${direction} ${clicks} clicks`,
            return_display: `Scrolled ${direction} ${clicks} clicks`,
          },
        };

      case 'scroll_up':
        await mouse.scrollY(clicks);
        return {
          success: true,
          data: {
            action: 'scroll_up',
            clicks,
            message: `Scrolled up ${clicks} clicks`,
            llm_content: `Scrolled up ${clicks} clicks`,
            return_display: `Scrolled up ${clicks} clicks`,
          },
        };

      case 'scroll_down':
        await mouse.scrollY(-clicks);
        return {
          success: true,
          data: {
            action: 'scroll_down',
            clicks,
            message: `Scrolled down ${clicks} clicks`,
            llm_content: `Scrolled down ${clicks} clicks`,
            return_display: `Scrolled down ${clicks} clicks`,
          },
        };

      default:
        return { success: false, error: `Unknown scroll action: ${action}` };
    }
  } catch (error) {
    console.error(`[ScrollTool] Error: ${error.message}`, error);
    return { success: false, error: `Scroll control failed: ${error.message}` };
  }
}

module.exports = {
  executeScrollControl,
};
