const {
  createContentProtectionRuntime,
} = require('../platform/content_protection/index.cjs');
const { logLiveSurfaceTrace } = require('../debug/live_surface_trace_runtime.cjs');
const {
  setOverlayAlwaysOnTop,
  setOverlayVisibleOnAllWorkspaces,
} = require('./overlay_topmost_runtime.cjs');

function activateWindowForInteraction(targetWindow) {
  if (
    !targetWindow
    || typeof targetWindow !== 'object'
    || (typeof targetWindow.isDestroyed === 'function' && targetWindow.isDestroyed())
  ) {
    return;
  }

  if (typeof targetWindow.moveTop === 'function') {
    targetWindow.moveTop();
  }
  if (typeof targetWindow.focus === 'function') {
    targetWindow.focus();
  }

  const webContents = targetWindow.webContents;
  if (
    webContents
    && !(typeof webContents.isDestroyed === 'function' && webContents.isDestroyed())
    && typeof webContents.focus === 'function'
  ) {
    webContents.focus();
  }
}

function createWindowPlatformPolicy({
  platform = process.platform,
  warn = console.warn,
} = {}) {
  function applyContentProtection({
    targetWindow,
    windowLabel = 'window',
    enabled = true,
  } = {}) {
    const runtime = createContentProtectionRuntime(platform);
    runtime({
      targetWindow,
      windowLabel,
      enabled,
      warn,
    });
    logLiveSurfaceTrace('window.content_protection.set', {
      source: 'window-platform-policy',
      windowLabel,
      enabled: enabled !== false,
      platform,
    });
  }

  function applyOverlayWindowPolicy({
    targetWindow,
    windowLabel = 'overlay window',
  } = {}) {
    setOverlayAlwaysOnTop({
      targetWindow,
      platform,
      warn,
      windowLabel,
    });
    setOverlayVisibleOnAllWorkspaces({
      targetWindow,
      platform,
      warn,
      windowLabel,
    });
  }

  return {
    platform,
    applyContentProtection,
    applyOverlayWindowPolicy,
    activateWindowForInteraction,
  };
}

module.exports = {
  activateWindowForInteraction,
  createWindowPlatformPolicy,
};
