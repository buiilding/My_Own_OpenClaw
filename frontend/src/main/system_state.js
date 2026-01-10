/**
 * System State Capture - Node.js implementation
 * 
 * Captures system state including active window, mouse position, 
 * system stats, clipboard, and screen resolution.
 */

const { windowManager } = require('node-window-manager');
const { mouse } = require('@nut-tree/nut-js');
const si = require('systeminformation');
const clipboardy = require('clipboardy');

/**
 * Get system state
 */
async function getSystemState() {
  try {
    // Run independent operations in parallel
    const [activeWindow, mousePos, screenRes, clipboard, internet, stats] = await Promise.all([
      getActiveWindow().catch(() => null),
      getMousePosition().catch(() => null),
      getScreenResolution().catch(() => 'Unknown'),
      getClipboardPreview().catch(() => '<error>'),
      checkInternet().catch(() => 'Unknown'),
      getResourceStats().catch(() => ({})),
    ]);

    return {
      active_window: activeWindow || 'Unknown',
      mouse_position: mousePos || 'Unknown',
      screen_resolution: screenRes,
      clipboard: clipboard,
      internet: internet,
      stats: stats,
      time: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[SystemState] Error: ${error.message}`, error);
    // Return fallback state
    return {
      active_window: 'Unknown',
      mouse_position: 'Unknown',
      screen_resolution: 'Unknown',
      clipboard: '<error>',
      internet: 'Unknown',
      stats: {},
      time: new Date().toISOString(),
    };
  }
}

/**
 * Get active window title
 */
async function getActiveWindow() {
  try {
    const activeWindow = windowManager.getActiveWindow();
    if (activeWindow) {
      return activeWindow.getTitle() || null;
    }
    return null;
  } catch (error) {
    console.error(`[SystemState] Failed to get active window: ${error.message}`);
    return null;
  }
}

/**
 * Get mouse position
 */
async function getMousePosition() {
  try {
    const position = await mouse.getPosition();
    return `(${position.x}, ${position.y})`;
  } catch (error) {
    console.error(`[SystemState] Failed to get mouse position: ${error.message}`);
    return null;
  }
}

/**
 * Get screen resolution
 */
async function getScreenResolution() {
  try {
    const displays = await si.graphics();
    if (displays && displays.displays && displays.displays.length > 0) {
      const display = displays.displays[0];
      return `${display.resolutionX}x${display.resolutionY}`;
    }
    return 'Unknown';
  } catch (error) {
    console.error(`[SystemState] Failed to get screen resolution: ${error.message}`);
    return 'Unknown';
  }
}

/**
 * Get clipboard preview (truncated)
 */
async function getClipboardPreview(maxLength = 100) {
  try {
    const content = await clipboardy.read();
    if (!content) {
      return '<empty>';
    }
    // Replace newlines to keep it one line
    const singleLine = content.replace(/\n/g, '\\n').replace(/\r/g, '');
    if (singleLine.length > maxLength) {
      return `${singleLine.substring(0, maxLength)}...`;
    }
    return singleLine;
  } catch (error) {
    console.error(`[SystemState] Failed to get clipboard: ${error.message}`);
    return '<error>';
  }
}

/**
 * Check internet connectivity
 */
async function checkInternet() {
  try {
    // Quick connectivity check
    const networkStats = await si.networkStats();
    // If we have network interfaces with traffic, assume online
    if (networkStats && networkStats.length > 0) {
      return 'Online';
    }
    return 'Offline';
  } catch (error) {
    // Try alternative method
    try {
      const dns = require('dns').promises;
      await dns.lookup('google.com');
      return 'Online';
    } catch {
      return 'Offline';
    }
  }
}

/**
 * Get resource stats (CPU, Memory, Battery)
 */
async function getResourceStats() {
  try {
    const [cpu, mem, battery] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ used: 0, total: 1 })),
      si.battery().catch(() => null),
    ]);

    const stats = {
      cpu_percent: cpu.currentLoad || 0,
      memory_percent: (mem.used / mem.total) * 100 || 0,
      battery_percent: battery ? battery.percent : null,
      battery_charging: battery ? battery.isCharging : null,
    };

    return stats;
  } catch (error) {
    console.error(`[SystemState] Failed to get resource stats: ${error.message}`);
    return {
      cpu_percent: 0,
      memory_percent: 0,
      battery_percent: null,
      battery_charging: null,
    };
  }
}

module.exports = {
  getSystemState,
  getActiveWindow,
  getMousePosition,
  getScreenResolution,
  getClipboardPreview,
  checkInternet,
  getResourceStats,
};
