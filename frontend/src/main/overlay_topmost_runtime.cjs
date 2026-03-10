function getOverlayAlwaysOnTopLevels(platform = process.platform) {
  void platform;
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
      return true;
    } catch (_error) {
      // Continue through fallback levels.
    }
  }

  try {
    targetWindow.setAlwaysOnTop(true);
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
