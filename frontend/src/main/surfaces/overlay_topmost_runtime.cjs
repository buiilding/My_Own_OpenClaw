const { logLiveSurfaceTrace } = require('../debug/live_surface_trace_runtime.cjs');

function getOverlayAlwaysOnTopLevels(platform = process.platform) {
  if (platform === 'darwin') {
    return ['floating'];
  }
  return ['screen-saver', 'floating'];
}

function setOverlayAlwaysOnTop({
  targetWindow,
  platform = process.platform,
  warn = console.warn,
  windowLabel = 'overlay window',
} = {}) {
  if (!targetWindow || typeof targetWindow.setAlwaysOnTop !== 'function') {
    return false;
  }

  const levels = getOverlayAlwaysOnTopLevels(platform);
  for (const level of levels) {
    try {
      targetWindow.setAlwaysOnTop(true, level);
      logLiveSurfaceTrace('window.topmost.set', {
        source: 'overlay-topmost-runtime',
        windowLabel,
        platform,
        level,
        enabled: true,
      });
      return true;
    } catch (_error) {
      // Continue through fallback levels.
    }
  }

  try {
    targetWindow.setAlwaysOnTop(true);
    logLiveSurfaceTrace('window.topmost.set', {
      source: 'overlay-topmost-runtime',
      windowLabel,
      platform,
      level: 'default',
      enabled: true,
    });
    return true;
  } catch (error) {
    warn(`[Main] Failed to keep ${windowLabel} on top:`, error?.message || error);
    return false;
  }
}

function setOverlayVisibleOnAllWorkspaces({
  targetWindow,
  platform = process.platform,
  warn = console.warn,
  windowLabel = 'overlay window',
} = {}) {
  if (platform === 'darwin') {
    // Native macOS panel windows already span Spaces/fullscreen without forcing
    // Electron's process-type transform path, which can emit SetApplicationIsDaemon warnings.
    return true;
  }

  if (!targetWindow || typeof targetWindow.setVisibleOnAllWorkspaces !== 'function') {
    return false;
  }

  const sharedOptions = { visibleOnFullScreen: true };

  try {
    targetWindow.setVisibleOnAllWorkspaces(true, sharedOptions);
    return true;
  } catch (error) {
    warn(`[Main] Failed to pin ${windowLabel} across workspaces/fullscreen:`, error?.message || error);
    return false;
  }
}

module.exports = {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
};
