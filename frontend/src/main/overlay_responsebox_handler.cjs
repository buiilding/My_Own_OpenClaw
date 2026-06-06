const {
  resolveActiveSurfaceDisplayAffinity,
} = require('./display_affinity_runtime.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeWindow,
} = require('./live_surface_trace_runtime.cjs');

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
  logLiveSurfaceTrace('response_overlay.renderer.size_report', {
    source: 'responsebox-size',
    turnRef: normalizedTurnRef,
    guardRef: normalizedStaleGuardRef,
    phase: getResponseOverlayPhase(),
    visible: shouldShow,
    fullScreen,
    compactHover,
    width: typeof width === 'number' ? width : Number(width) || null,
    height: typeof height === 'number' ? height : Number(height) || null,
    responseWindow: summarizeWindow(responseWindow, 'response overlay'),
  });
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
      logLiveSurfaceTrace('response_overlay.window.hide_ignored', {
        source: 'responsebox-size',
        reason: 'stale-hide',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        activeGuardRef,
        phase: getResponseOverlayPhase(),
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
        responseOverlayVisible: getResponseOverlayVisible(),
      });
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
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'responsebox-size',
        reason: 'hide',
        previousGuardRef: activeGuardRef,
        nextGuardRef: null,
        turnRef: normalizedTurnRef,
      });
    }
    if (responseWindow.isVisible()) {
      responseWindow.hide();
      logLiveSurfaceTrace('response_overlay.window.hide', {
        source: 'responsebox-size',
        reason: 'renderer-size-hide',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        phase: getResponseOverlayPhase(),
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
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
        logLiveSurfaceTrace('stale_guard.changed', {
          source: 'responsebox-size',
          reason: 'fullscreen-size-report',
          nextGuardRef: normalizedStaleGuardRef,
          turnRef: normalizedTurnRef,
        });
      }
      setResponseOverlayVisibilityState(true);
      showResponseWindowForLiveTurnIntent();
      logLiveSurfaceTrace('response_overlay.window.show', {
        source: 'responsebox-size',
        reason: 'fullscreen-size-report',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        phase: getResponseOverlayPhase(),
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
      logLiveSurfaceTrace('response_overlay.window.resize', {
        source: 'responsebox-size',
        reason: 'fullscreen-size-report',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        phase: getResponseOverlayPhase(),
        width: nextBounds.width,
        height: nextBounds.height,
      });
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
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'responsebox-size',
        reason: 'size-report',
        nextGuardRef: normalizedStaleGuardRef,
        turnRef: normalizedTurnRef,
      });
    }
    setResponseOverlayVisibilityState(true);
    showResponseWindowForLiveTurnIntent();
    logLiveSurfaceTrace('response_overlay.window.show', {
      source: 'responsebox-size',
      reason: 'size-report',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      phase: getResponseOverlayPhase(),
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
    });
    logLiveSurfaceTrace('response_overlay.window.resize', {
      source: 'responsebox-size',
      reason: compactHover ? 'awaiting-size-report' : 'response-size-report',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      phase: getResponseOverlayPhase(),
      overlayMode: compactHover ? 'awaiting' : 'response',
      width: nextWidth,
      height: nextHeight,
    });
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
