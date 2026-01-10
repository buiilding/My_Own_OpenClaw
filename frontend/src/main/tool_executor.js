/**
 * Tool Executor - Stateless Request/Response Handler
 * 
 * Executes tools using Node.js implementations (nut-js, systeminformation, etc.)
 * Supports skipAutoCapture flag for bundling optimization.
 */

const { ipcMain } = require('electron');
const mouseTool = require('./tools/computer/mouse');
const keyboardTool = require('./tools/computer/keyboard');
const screenshotTool = require('./tools/computer/screenshot');
const scrollTool = require('./tools/computer/scroll');
const listDirectoryTool = require('./tools/filesystem/list_directory');
const readFileTool = require('./tools/filesystem/read_file');
const writeFileTool = require('./tools/filesystem/write_file');
const shellTool = require('./tools/system/shell');
const windowTool = require('./tools/system/window_tool');
const statsTool = require('./tools/system/stats_tool');
const waitTool = require('./tools/system/wait_tool');
const { getSystemState } = require('./system_state');

// Tool registry
const tools = {
  mouse_control: mouseTool.executeMouseControl,
  keyboard_control: keyboardTool.executeKeyboardControl,
  screenshot: screenshotTool.captureScreenshot,
  scroll_control: scrollTool.executeScrollControl,
  list_directory: listDirectoryTool.listDirectory,
  read_file: readFileTool.readFile,
  write_file: writeFileTool.writeFile,
  run_shell_command: shellTool.runShellCommand,
  switch_tab: windowTool.switchToWindow,
  get_open_windows: windowTool.getOpenWindows,
  get_system_stats: statsTool.getSystemStats,
  wait: waitTool.wait,
};

// Tools that require auto-capture (screenshot after execution)
const AUTO_CAPTURE_TOOLS = {
  mouse_control: 'screenshot',
  keyboard_control: 'screenshot',
  scroll_control: 'screenshot',
  switch_tab: 'screenshot',
};

/**
 * Get auto-capture type for a tool
 */
function getAutoCaptureType(toolName) {
  return AUTO_CAPTURE_TOOLS[toolName] || null;
}

/**
 * Initialize tool executor IPC handlers
 */
function initializeToolExecutor() {
  // Main tool execution handler - stateless request/response
  ipcMain.handle('execute-tool', async (event, { toolName, args, skipAutoCapture = false }) => {
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, { skipAutoCapture });

    const tool = tools[toolName];
    if (!tool) {
      console.error(`[ToolExecutor] Tool not found: ${toolName}`);
      return { success: false, error: `Tool ${toolName} not found` };
    }

    try {
      // Execute tool (skipAutoCapture passed to tool if needed)
      const result = await tool(args, skipAutoCapture);

      // Only capture system state and screenshot if NOT skipping
      if (!skipAutoCapture && result.success) {
        const autoCaptureType = getAutoCaptureType(toolName);

        if (autoCaptureType === 'screenshot') {
          // Wait a bit for UI to update (especially for computer control tools)
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Capture screenshot
          const screenshotResult = await screenshotTool.captureScreenshot({}, false);
          if (screenshotResult.success) {
            result.data = result.data || {};
            result.data.screenshot = screenshotResult.data.screenshot;
          }
        }

        // Get system state
        try {
          const systemState = await getSystemState();
          result.data = result.data || {};
          result.data.system_state = systemState;
        } catch (error) {
          console.error(`[ToolExecutor] Failed to capture system state: ${error.message}`);
          // Continue without system state
        }
      }

      return result;
    } catch (error) {
      console.error(`[ToolExecutor] Tool execution failed: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // System state handler (for bundle end)
  ipcMain.handle('get-system-state', async () => {
    try {
      return await getSystemState();
    } catch (error) {
      console.error(`[ToolExecutor] Failed to get system state: ${error.message}`);
      return null;
    }
  });

  console.log('[ToolExecutor] Tool executor initialized');
}

module.exports = {
  initializeToolExecutor,
};
