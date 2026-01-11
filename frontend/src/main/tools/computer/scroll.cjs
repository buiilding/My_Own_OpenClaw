/**
 * Scroll Control Tool - Node.js implementation using nut-js
 */

const { loadNutJs } = require('../nutjs_loader.cjs');

/**
 * Execute scroll control action
 */
async function executeScrollControl(args, skipAutoCapture) {
  const { action, x, y, clicks = 3, direction } = args;

  try {
    const nutjs = await loadNutJs();
    const { mouse, Point } = nutjs;
    
    switch (action) {
      case 'scroll':
        if (!direction) {
          return { success: false, error: 'direction required for scroll action' };
        }

        if (x !== null && x !== undefined && y !== null && y !== undefined) {
          await mouse.setPosition(new Point(x, y));
        }

        // Use nut-js directional scroll methods
        if (direction === 'up') {
          await mouse.scrollUp(clicks);
        } else if (direction === 'down') {
          await mouse.scrollDown(clicks);
        } else if (direction === 'left') {
          await mouse.scrollLeft(clicks);
        } else if (direction === 'right') {
          await mouse.scrollRight(clicks);
        } else {
          return { success: false, error: `Invalid scroll direction: ${direction}` };
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
        await mouse.scrollUp(clicks);
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
        await mouse.scrollDown(clicks);
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
