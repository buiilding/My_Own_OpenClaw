/**
 * Mouse Control Tool - Node.js implementation using nut-js
 */

const { loadNutJs } = require('../nutjs_loader.cjs');

/**
 * Execute mouse control action
 */
async function executeMouseControl(args, skipAutoCapture) {
  const { action, x, y, scroll_amount, scroll_direction = 'vertical' } = args;

  try {
    const nutjs = await loadNutJs();
    const { mouse, Button, Point } = nutjs;
    
    if (action !== 'scroll' && (x === null || x === undefined || y === null || y === undefined)) {
      return { success: false, error: 'X and Y coordinates are required' };
    }

    switch (action) {
      case 'click':
        await mouse.setPosition(new Point(x, y));
        await mouse.click(Button.LEFT);
        return {
          success: true,
          data: {
            action: 'click',
            coordinates: [x, y],
            message: `Clicked at (${x}, ${y})`,
            llm_content: `Clicked at (${x}, ${y})`,
            return_display: `Clicked at (${x}, ${y})`,
          },
        };

      case 'double_click':
        await mouse.setPosition(new Point(x, y));
        await mouse.doubleClick(Button.LEFT);
        return {
          success: true,
          data: {
            action: 'double_click',
            coordinates: [x, y],
            message: `Double-clicked at (${x}, ${y})`,
            llm_content: `Double-clicked at (${x}, ${y})`,
            return_display: `Double-clicked at (${x}, ${y})`,
          },
        };

      case 'right_click':
        await mouse.setPosition(new Point(x, y));
        await mouse.click(Button.RIGHT);
        return {
          success: true,
          data: {
            action: 'right_click',
            coordinates: [x, y],
            message: `Right-clicked at (${x}, ${y})`,
            llm_content: `Right-clicked at (${x}, ${y})`,
            return_display: `Right-clicked at (${x}, ${y})`,
          },
        };

      case 'move':
        await mouse.setPosition(new Point(x, y));
        return {
          success: true,
          data: {
            action: 'move',
            coordinates: [x, y],
            message: `Moved cursor to (${x}, ${y})`,
            llm_content: `Moved cursor to (${x}, ${y})`,
            return_display: `Moved cursor to (${x}, ${y})`,
          },
        };

      case 'drag':
        if (x === null || x === undefined || y === null || y === undefined) {
          return { success: false, error: 'X and Y coordinates are required for drag action.' };
        }
        await mouse.drag(new Point(x, y));
        return {
          success: true,
          data: {
            action: 'drag',
            coordinates: [x, y],
            message: `Dragged to (${x}, ${y})`,
            llm_content: `Dragged to (${x}, ${y})`,
            return_display: `Dragged to (${x}, ${y})`,
          },
        };

      case 'scroll':
        if (scroll_amount === null || scroll_amount === undefined) {
          return { success: false, error: 'scroll_amount required for scroll action' };
        }

        if (x !== null && x !== undefined && y !== null && y !== undefined) {
          await mouse.setPosition(new Point(x, y));
        }

        // Use nut-js directional scroll methods
        // scroll_amount is typically positive, direction determines up/down or left/right
        if (scroll_direction === 'vertical') {
          if (scroll_amount > 0) {
            await mouse.scrollDown(scroll_amount);
          } else {
            await mouse.scrollUp(Math.abs(scroll_amount));
          }
        } else {
          // horizontal scrolling
          if (scroll_amount > 0) {
            await mouse.scrollRight(scroll_amount);
          } else {
            await mouse.scrollLeft(Math.abs(scroll_amount));
          }
        }

        return {
          success: true,
          data: {
            action: 'scroll',
            coordinates: x !== null && y !== null ? [x, y] : null,
            scroll_amount,
            scroll_direction,
            message: `Scrolled ${scroll_direction} ${scroll_amount}`,
            llm_content: `Scrolled ${scroll_direction} ${scroll_amount}`,
            return_display: `Scrolled ${scroll_direction} ${scroll_amount}`,
          },
        };

      default:
        return { success: false, error: `Unknown mouse action: ${action}` };
    }
  } catch (error) {
    console.error(`[MouseTool] Error: ${error.message}`, error);
    return { success: false, error: `Mouse action failed: ${error.message}` };
  }
}

module.exports = {
  executeMouseControl,
};
