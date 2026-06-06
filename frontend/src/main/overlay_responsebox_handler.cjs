const {
  resolveActiveSurfaceDisplayAffinity,
} = require('./display_affinity_runtime.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function resolveFullscreenBounds({
  BrowserWindow,
  screen,
  webContents,
  chatWindow,
  mainWindow,
  getActiveDisplayAffinity,
}) {
  const displayAffinity = resolveActiveSurfaceDisplayAffinity({
    BrowserWindow,
    screen,
    webContents,
    chatWindow,
    mainWindow,
    getActiveDisplayAffinity,
  });
  const bounds = displayAffinity?.bounds || screen.getPrimaryDisplay()?.bounds;
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
}

function normalizeResponseOverlayGuardRef(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function shouldIgnoreStaleHide({
  staleGuardRef,
  activeGuardRef,
}) {
  if (!activeGuardRef) {
    return false;
  }
  if (!staleGuardRef) {
    return true;
  }
  return staleGuardRef !== activeGuardRef;
}

async function handleSetResponseboxSize(
  {
    width,
    height,
    visible,
    full_screen: fullScreen = false,
    compact_hover: compactHover = false,
    turn_ref: turnRef = null,
    stale_guard_ref: staleGuardRef = null,
  } = {},
  deps = {},
) {
  const {
    responseWindow,
    chatWindow,
    mainWindow,
    screen,
    BrowserWindow,
    webContents = null,
    getActiveDisplayAffinity = () => null,
    getResponseWindowBounds,
    setResponseOverlayVisibilityState,
    showResponseWindowForLiveTurnIntent = () => {},
    getResponseOverlayVisible = () => false,
    getResponseOverlayPhase = () => null,
    getActiveResponseOverlayGuardRef = () => null,
    setActiveResponseOverlayGuardRef = () => {},
  } = deps;

  if (!responseWindow || responseWindow.isDestroyed()) {
    return { success: false, reason: 'Response window not available' };
  }

  const shouldShow = Boolean(visible);
  const normalizedTurnRef = normalizeResponseOverlayGuardRef(turnRef);
  const normalizedStaleGuardRef = normalizeResponseOverlayGuardRef(staleGuardRef)
    || normalizedTurnRef;
  if (!shouldShow) {
    const activeGuardRef = normalizeResponseOverlayGuardRef(getActiveResponseOverlayGuardRef());
    if (shouldIgnoreStaleHide({
      staleGuardRef: normalizedStaleGuardRef,
      activeGuardRef,
    })) {
      console.log('[ResponseOverlayWindow][main]', {
        action: 'ignore-stale-hide-from-size',
        phase: getResponseOverlayPhase(),
        turn_ref: normalizedTurnRef,
        stale_guard_ref: normalizedStaleGuardRef,
        active_guard_ref: activeGuardRef,
        response_window_visible: safeWindowVisible(responseWindow),
        response_overlay_visible_flag: getResponseOverlayVisible(),
      });
      logChatPillMainTrace({
        source: 'responsebox-size',
        action: 'ignore-stale-hide',
        phase: getResponseOverlayPhase(),
        responseWindow,
        responseOverlayVisibleFlag: getResponseOverlayVisible(),
        turnRef: normalizedTurnRef,
        staleGuardRef: normalizedStaleGuardRef,
        activeGuardRef,
      }, deps);
      return {
        success: true,
        visible: true,
        ignored: true,
        reason: 'stale-hide',
      };
    }
    setResponseOverlayVisibilityState(false);
    if (!normalizedStaleGuardRef || normalizedStaleGuardRef === activeGuardRef) {
      setActiveResponseOverlayGuardRef(null);
    }
    if (responseWindow.isVisible()) {
      responseWindow.hide();
    }
    console.log('[ResponseOverlayWindow][main]', {
      action: 'hide-from-size',
      phase: getResponseOverlayPhase(),
      requested_visible: false,
      turn_ref: normalizedTurnRef,
      stale_guard_ref: normalizedStaleGuardRef,
      response_window_visible: safeWindowVisible(responseWindow),
      response_overlay_visible_flag: getResponseOverlayVisible(),
    });
    logChatPillMainTrace({
      source: 'responsebox-size',
      action: 'hide',
      phase: getResponseOverlayPhase(),
      responseWindow,
      responseOverlayVisibleFlag: false,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
    }, deps);
    return { success: true, visible: false };
  }

  if (fullScreen === true) {
    try {
      const nextBounds = resolveFullscreenBounds({
        BrowserWindow,
        screen,
        webContents,
        chatWindow,
        mainWindow,
        getActiveDisplayAffinity,
      });
      responseWindow.setBounds(nextBounds, false);
      if (normalizedStaleGuardRef) {
        setActiveResponseOverlayGuardRef(normalizedStaleGuardRef);
      }
      setResponseOverlayVisibilityState(true);
      showResponseWindowForLiveTurnIntent();
      console.log('[ResponseOverlayWindow][main]', {
        action: 'show-fullscreen-from-size',
        phase: getResponseOverlayPhase(),
        requested_visible: true,
        turn_ref: normalizedTurnRef,
        stale_guard_ref: normalizedStaleGuardRef,
        response_window_visible: safeWindowVisible(responseWindow),
        response_overlay_visible_flag: getResponseOverlayVisible(),
        width: nextBounds.width,
        height: nextBounds.height,
      });
      logChatPillMainTrace({
        source: 'responsebox-size',
        action: 'set-bounds',
        phase: getResponseOverlayPhase(),
        responseWindow,
        responseOverlayVisibleFlag: getResponseOverlayVisible(),
        turnRef: normalizedTurnRef,
        staleGuardRef: normalizedStaleGuardRef,
      }, deps);
      return {
        success: true,
        visible: true,
        fullScreen: true,
        width: nextBounds.width,
        height: nextBounds.height,
      };
    } catch (error) {
      return { success: false, reason: `Failed to enter fullscreen ghost overlay: ${error.message}` };
    }
  }

  const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
  const nextHeight = Math.max(1, Math.min(750, Math.round(Number(height) || 0)));
  try {
    const bounds = compactHover
      ? getResponseWindowBounds(nextWidth, nextHeight, { compactHover: true })
      : getResponseWindowBounds(nextWidth, nextHeight);
    responseWindow.setBounds(bounds, false);
    if (normalizedStaleGuardRef) {
      setActiveResponseOverlayGuardRef(normalizedStaleGuardRef);
    }
    setResponseOverlayVisibilityState(true);
    showResponseWindowForLiveTurnIntent();
    console.log('[ResponseOverlayWindow][main]', {
      action: 'show-or-resize-from-size',
      phase: getResponseOverlayPhase(),
      requested_visible: true,
      response_window_visible: safeWindowVisible(responseWindow),
      response_overlay_visible_flag: getResponseOverlayVisible(),
      response_layout_mode: compactHover ? 'awaiting-typing' : 'response',
      turn_ref: normalizedTurnRef,
      stale_guard_ref: normalizedStaleGuardRef,
      width: nextWidth,
      height: nextHeight,
    });
    logChatPillMainTrace({
      source: 'responsebox-size',
      action: 'set-bounds',
      phase: getResponseOverlayPhase(),
      responseWindow,
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
      responseLayoutMode: compactHover ? 'awaiting-typing' : 'response',
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
    }, deps);
    return {
      success: true,
      visible: true,
      width: nextWidth,
      height: nextHeight,
    };
  } catch (error) {
    return { success: false, reason: `Failed to resize response overlay: ${error.message}` };
  }
}

module.exports = {
  handleSetResponseboxSize,
};
