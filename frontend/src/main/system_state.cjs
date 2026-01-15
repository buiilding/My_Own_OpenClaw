/**
 * System State Capture - Node.js implementation
 * 
 * Captures system state including active window, mouse position, 
 * system stats, clipboard, and screen resolution.
 */

const { windowManager } = require('node-window-manager');
const si = require('systeminformation');
const { loadNutJs } = require('./tools/nutjs_loader.cjs');
// @nut-tree/nut-js and clipboardy are ES modules, must use dynamic import

/**
 * Get system state
 */
async function getSystemState() {
  const totalStart = performance.now();
  try {
    // Run independent operations in parallel with individual timing
    const [activeWindow, mousePos, screenRes, clipboard, internet, stats] = await Promise.all([
      (async () => {
        const start = performance.now();
        const result = await getActiveWindow().catch(() => null);
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] getActiveWindow took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await getMousePosition().catch(() => null);
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] getMousePosition took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await getScreenResolution().catch(() => 'Unknown');
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] getScreenResolution took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await getClipboardPreview().catch(() => '<error>');
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] getClipboardPreview took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await checkInternet().catch(() => 'Unknown');
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] checkInternet took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await getResourceStats().catch(() => ({}));
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] getResourceStats took ${time.toFixed(3)}s`);
        return result;
      })(),
    ]);

    const totalTime = (performance.now() - totalStart) / 1000;
    console.log(`[Timing] getSystemState total time: ${totalTime.toFixed(3)}s`);
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
    const totalTime = (performance.now() - totalStart) / 1000;
    console.error(`[SystemState] Error after ${totalTime.toFixed(3)}s: ${error.message}`, error);
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
    // Use the nutjs loader to avoid circular dependency
    const nutjs = await loadNutJs();
    if (!nutjs || !nutjs.mouse) {
      console.error(`[SystemState] loadNutJs returned invalid result:`, {
        hasNutjs: !!nutjs,
        hasMouse: !!(nutjs && nutjs.mouse),
        keys: nutjs ? Object.keys(nutjs) : []
      });
      return null;
    }
    const { mouse } = nutjs;
    if (typeof mouse.getPosition !== 'function') {
      console.error(`[SystemState] mouse.getPosition is not a function:`, typeof mouse.getPosition);
      return null;
    }
    const position = await mouse.getPosition();
    return `(${position.x}, ${position.y})`;
  } catch (error) {
    console.error(`[SystemState] Failed to get mouse position: ${error.message}`, error);
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
    // Dynamic import for ES module - clipboardy v3 may use default or named export
    const clipboardyModule = await import('clipboardy');
    const clipboardy = clipboardyModule.default || clipboardyModule;
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
      (async () => {
        const start = performance.now();
        const result = await si.currentLoad().catch(() => ({ currentLoad: 0 }));
        const time = (performance.now() - start) / 1000;
        console.log(`[Timing] si.currentLoad() took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await si.mem().catch(() => ({ used: 0, total: 1 }));
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] si.mem() took ${time.toFixed(3)}s`);
        return result;
      })(),
      (async () => {
        const start = performance.now();
        const result = await si.battery().catch(() => null);
        const time = (performance.now() - start) / 1000;
        if (time > 0.01) console.log(`[Timing] si.battery() took ${time.toFixed(3)}s`);
        return result;
      })(),
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
