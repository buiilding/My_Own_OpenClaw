function getOverlayAlwaysOnTopLevels(platform = process.platform) {
  if (platform === 'darwin') {
    return ['screen-saver', 'floating'];
  }
  return ['floating'];
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

module.exports = {
  getOverlayAlwaysOnTopLevels,
  setOverlayAlwaysOnTop,
};
