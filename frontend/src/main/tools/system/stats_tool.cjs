/**
 * System Stats Tool - Node.js implementation using systeminformation
 */

const si = require('systeminformation');

/**
 * Get system statistics
 */
async function getSystemStats(args, skipAutoCapture) {
  try {
    const [cpu, mem, battery] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.battery().catch(() => null), // Battery may not be available
    ]);

    const stats = {
      cpu_percent: cpu.currentLoad || 0,
      memory_percent: (mem.used / mem.total) * 100,
      battery_percent: battery ? battery.percent : null,
      battery_charging: battery ? battery.isCharging : null,
    };

    const content = JSON.stringify(stats, null, 2);

    return {
      success: true,
      data: {
        stats,
        llm_content: content,
      },
    };
  } catch (error) {
    console.error(`[StatsTool] Error: ${error.message}`, error);
    return { success: false, error: `Failed to get system stats: ${error.message}` };
  }
}

module.exports = {
  getSystemStats,
};
