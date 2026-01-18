/**
 * Window Management Tool - Node.js implementation using node-window-manager
 */

const { windowManager } = require('node-window-manager');

/**
 * Switch to a window by title
 */
async function switchToWindow(args, skipAutoCapture) {
  const { tab_name } = args;

  try {
    const windows = windowManager.getWindows();
    const target = windows.find(w => {
      const title = w.getTitle();
      return title && title.toLowerCase().includes(tab_name.toLowerCase());
    });

    if (!target) {
      return {
        success: false,
        error: `Could not find or switch to window/tab with name: ${tab_name}. Make sure the tab/window name matches exactly what appears in get_open_windows output.`,
      };
    }

    // Bring window to front
    target.bringToFront();

    return {
      success: true,
      data: {
        tab_name,
        llm_content: `Successfully switched to tab '${tab_name}'`,
        return_display: `Successfully switched to tab '${tab_name}'`,
      },
    };
  } catch (error) {
    console.error(`[WindowTool] Error: ${error.message}`, error);
    return { success: false, error: `Tab switching operation failed: ${error.message}` };
  }
}

/**
 * Get list of open windows
 */
async function getOpenWindows(args, skipAutoCapture) {
  const { filter_text = '' } = args;

  try {
    const windows = windowManager.getWindows();
    let windowTitles = windows
      .map(w => w.getTitle())
      .filter(title => title && title.trim().length > 0);

    // Apply filter if provided
    if (filter_text) {
      const query = filter_text.toLowerCase();
      windowTitles = windowTitles.filter(title => title.toLowerCase().includes(query));
    }

    const content = windowTitles.length > 0
      ? windowTitles.map(w => `- ${w}`).join('\n')
      : 'No open windows found.';

    return {
      success: true,
      data: {
        windows: windowTitles,
        llm_content: content,
      },
    };
  } catch (error) {
    console.error(`[WindowTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to get open windows: ${error.message}` };
  }
}

module.exports = {
  switchToWindow,
  getOpenWindows,
};
