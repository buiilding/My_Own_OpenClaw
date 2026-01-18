/**
 * Tool Executor - Stateless Request/Response Handler
 * 
 * Executes tools using Node.js implementations (nut-js, systeminformation, etc.)
 * Supports skipAutoCapture flag for bundling optimization.
 */

const { ipcMain } = require('electron');
const mouseTool = require('./tools/computer/mouse.cjs');
const keyboardTool = require('./tools/computer/keyboard.cjs');
const screenshotTool = require('./tools/computer/screenshot.cjs');
const scrollTool = require('./tools/computer/scroll.cjs');
const listDirectoryTool = require('./tools/filesystem/list_directory.cjs');
const readFileTool = require('./tools/filesystem/read_file.cjs');
const writeFileTool = require('./tools/filesystem/write_file.cjs');
const shellTool = require('./tools/system/shell.cjs');
const windowTool = require('./tools/system/window_tool.cjs');
const statsTool = require('./tools/system/stats_tool.cjs');
const waitTool = require('./tools/system/wait_tool.cjs');
const { getSystemState } = require('./system_state.cjs');

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
  wait: 'screenshot', // Capture screenshot after waiting to see current state
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
    const totalStartTime = performance.now();
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, { skipAutoCapture });

    const tool = tools[toolName];
    if (!tool) {
      console.error(`[ToolExecutor] Tool not found: ${toolName}`);
      return { success: false, error: `Tool ${toolName} not found` };
    }

    try {
      // Execute tool (skipAutoCapture passed to tool if needed)
      const toolStartTime = performance.now();
      const result = await tool(args, skipAutoCapture);
      const toolExecutionTime = (performance.now() - toolStartTime) / 1000;
      console.log(`[Timing] Tool ${toolName} execution took ${toolExecutionTime.toFixed(3)}s`);

      // Only capture system state and screenshot if NOT skipping
      if (!skipAutoCapture && result.success) {
        const autoCaptureType = getAutoCaptureType(toolName);

        if (autoCaptureType === 'screenshot') {
          // Wait a bit for UI to update (especially for computer control tools)
          const uiWaitStartTime = performance.now();
          await new Promise(resolve => setTimeout(resolve, 2000));
          const uiWaitTime = (performance.now() - uiWaitStartTime) / 1000;
          console.log(`[Timing] UI update delay: ${uiWaitTime.toFixed(3)}s (hardcoded 2s wait)`);

          // Capture screenshot
          const screenshotStartTime = performance.now();
          const screenshotResult = await screenshotTool.captureScreenshot({}, false);
          const screenshotTime = (performance.now() - screenshotStartTime) / 1000;
          console.log(`[Timing] Screenshot capture took ${screenshotTime.toFixed(3)}s`);
          if (screenshotResult.success) {
            result.data = result.data || {};
            result.data.screenshot = screenshotResult.data.screenshot;
          }
        }

        // Get system state
        try {
          const systemStateStartTime = performance.now();
          const systemState = await getSystemState();
          const systemStateTime = (performance.now() - systemStateStartTime) / 1000;
          console.log(`[Timing] System state gathering took ${systemStateTime.toFixed(3)}s`);
          result.data = result.data || {};
          result.data.system_state = systemState;
        } catch (error) {
          console.error(`[ToolExecutor] Failed to capture system state: ${error.message}`);
          // Continue without system state
        }
      }

      const totalTime = (performance.now() - totalStartTime) / 1000;
      console.log(`[Timing] Total tool output gathering took ${totalTime.toFixed(3)}s (tool: ${toolName})`);
      return result;
    } catch (error) {
      const totalTime = (performance.now() - totalStartTime) / 1000;
      console.error(`[ToolExecutor] Tool execution failed: ${error.message}`, error);
      console.log(`[Timing] Tool execution failed after ${totalTime.toFixed(3)}s (tool: ${toolName})`);
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
