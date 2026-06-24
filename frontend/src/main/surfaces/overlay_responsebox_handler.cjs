/**
 * Handles overlay responsebox events for the Electron main process.
 */

const {
  resolveActiveSurfaceDisplayAffinity,
} = require('./display_affinity_runtime.cjs');
const { logChatPillMainTrace } = require('../debug/chat_pill_trace_runtime.cjs');
const {
  logLiveSurfaceTrace,
  summarizeWindow,
} = require('../debug/live_surface_trace_runtime.cjs');
const {
  appendSurfaceVisibilityDiagnostic,
} = require('../diagnostics/app_diagnostics_runtime.cjs');

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function' || win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function safeWindowDestroyed(win) {
  if (!win || typeof win !== 'object' || typeof win.isDestroyed !== 'function') {
    return null;
  }
  try {
    return Boolean(win.isDestroyed());
  } catch (_error) {
    return null;
  }
}

function safeWindowBounds(win) {
  if (!win || typeof win !== 'object' || safeWindowDestroyed(win) === true) {
    return null;
  }
  if (typeof win.getBounds !== 'function') {
    return null;
  }
  try {
    const bounds = win.getBounds();
    if (!bounds || typeof bounds !== 'object') {
      return null;
    }
    return {
      x: Number.isFinite(bounds.x) ? bounds.x : null,
      y: Number.isFinite(bounds.y) ? bounds.y : null,
      width: Number.isFinite(bounds.width) ? bounds.width : null,
      height: Number.isFinite(bounds.height) ? bounds.height : null,
    };
  } catch (_error) {
    return null;
  }
}

function safeWindowFocusable(win) {
  if (!win || typeof win !== 'object' || safeWindowDestroyed(win) === true) {
    return null;
  }
  if (typeof win.isFocusable !== 'function') {
    return null;
  }
  try {
    return Boolean(win.isFocusable());
  } catch (_error) {
    return null;
  }
}

function summarizeNativeWindowForDismiss(win, label) {
  return {
    label,
    visible: safeWindowVisible(win),
    destroyed: safeWindowDestroyed(win),
    focusable: safeWindowFocusable(win),
    bounds: safeWindowBounds(win),
  };
}

function logResponseOverlayDismissSnapshot({
  reason,
  turnRef,
  guardRef,
  phase,
  activeGuardRef,
  responseOverlayVisible,
  responseWindow,
  chatWindow,
}) {
  logLiveSurfaceTrace('response_overlay.dismiss.native_snapshot', {
    source: 'responsebox-size',
    reason,
    turnRef,
    guardRef,
    activeGuardRef,
    phase,
    responseOverlayVisible,
    responseWindow: summarizeNativeWindowForDismiss(responseWindow, 'response overlay'),
    chatWindow: summarizeNativeWindowForDismiss(chatWindow, 'chat box'),
  });
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

function normalizeResponseboxLayoutMode(value, {
  shouldShow,
  compactHover,
  fullScreen,
} = {}) {
  if (value === 'hidden' || value === 'awaiting-typing' || value === 'response') {
    return value;
  }
  if (!shouldShow) {
    return 'hidden';
  }
  if (fullScreen === true) {
    return 'response';
  }
  return compactHover === true ? 'awaiting-typing' : 'response';
}

function responseboxLayoutModeRank(layoutMode) {
  if (layoutMode === 'response') {
    return 2;
  }
  if (layoutMode === 'awaiting-typing') {
    return 1;
  }
  return 0;
}

function shouldIgnoreRegressiveLayoutMode({
  incomingLayoutMode,
  currentLayoutMode,
  staleGuardRef,
}) {
  if (!staleGuardRef || !currentLayoutMode) {
    return false;
  }
  return responseboxLayoutModeRank(incomingLayoutMode) < responseboxLayoutModeRank(currentLayoutMode);
}

async function handleSetResponseboxSize(
  {
    width,
    height,
    visible,
    dismissed = false,
    full_screen: fullScreen = false,
    compact_hover: compactHover = false,
    layout_mode: layoutMode = null,
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
    getResponseOverlayLayoutMode = () => null,
    setResponseOverlayLayoutMode = () => {},
    clearResponseOverlayLayoutMode = () => false,
    dismissResponseOverlayGuardRef = () => false,
    canShowFloatingResponseOverlay = () => true,
  } = deps;

  if (!responseWindow || responseWindow.isDestroyed()) {
    return { success: false, reason: 'Response window not available' };
  }

  const shouldShow = Boolean(visible);
  const normalizedTurnRef = normalizeResponseOverlayGuardRef(turnRef);
  const normalizedStaleGuardRef = normalizeResponseOverlayGuardRef(staleGuardRef)
    || normalizedTurnRef;
  const incomingLayoutMode = normalizeResponseboxLayoutMode(layoutMode, {
    shouldShow,
    compactHover,
    fullScreen,
  });
  logLiveSurfaceTrace('response_overlay.renderer.size_report', {
    source: 'responsebox-size',
    turnRef: normalizedTurnRef,
    guardRef: normalizedStaleGuardRef,
    phase: getResponseOverlayPhase(),
    visible: shouldShow,
    dismissed: dismissed === true,
    fullScreen,
    compactHover,
    responseLayoutMode: incomingLayoutMode,
    width: typeof width === 'number' ? width : Number(width) || null,
    height: typeof height === 'number' ? height : Number(height) || null,
    responseWindow: summarizeWindow(responseWindow, 'response overlay'),
  });
  if (!shouldShow) {
    const activeGuardRef = normalizeResponseOverlayGuardRef(getActiveResponseOverlayGuardRef());
    if (dismissed === true && normalizedStaleGuardRef) {
      dismissResponseOverlayGuardRef(normalizedStaleGuardRef);
    }
    if (shouldIgnoreStaleHide({
      staleGuardRef: normalizedStaleGuardRef,
      activeGuardRef,
    })) {
      appendSurfaceVisibilityDiagnostic({
        action: 'ignore-stale-hide-from-size',
        phase: getResponseOverlayPhase(),
        turnRef: normalizedTurnRef,
        staleGuardRef: normalizedStaleGuardRef,
        activeGuardRef: activeGuardRef,
        responseWindowVisible: safeWindowVisible(responseWindow),
        responseOverlayVisibleFlag: getResponseOverlayVisible(),
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
      logResponseOverlayDismissSnapshot({
        reason: 'stale-hide',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        activeGuardRef,
        phase: getResponseOverlayPhase(),
        responseOverlayVisible: getResponseOverlayVisible(),
        responseWindow,
        chatWindow,
      });
      return {
        success: true,
        visible: true,
        ignored: true,
        reason: 'stale-hide',
      };
    }
    setResponseOverlayVisibilityState(false);
    clearResponseOverlayLayoutMode(normalizedStaleGuardRef);
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
    logResponseOverlayDismissSnapshot({
      reason: 'renderer-size-hide-before-native-hide',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      activeGuardRef,
      phase: getResponseOverlayPhase(),
      responseOverlayVisible: getResponseOverlayVisible(),
      responseWindow,
      chatWindow,
    });
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
    logResponseOverlayDismissSnapshot({
      reason: 'renderer-size-hide-after-native-hide',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      activeGuardRef,
      phase: getResponseOverlayPhase(),
      responseOverlayVisible: getResponseOverlayVisible(),
      responseWindow,
      chatWindow,
    });
    appendSurfaceVisibilityDiagnostic({
      action: 'hide-from-size',
      phase: getResponseOverlayPhase(),
      requestedVisible: false,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
      responseWindowVisible: safeWindowVisible(responseWindow),
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
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

  if (!canShowFloatingResponseOverlay()) {
    const activeGuardRef = normalizeResponseOverlayGuardRef(getActiveResponseOverlayGuardRef());
    setResponseOverlayVisibilityState(false);
    clearResponseOverlayLayoutMode(activeGuardRef);
    if (activeGuardRef) {
      setActiveResponseOverlayGuardRef(null);
      logLiveSurfaceTrace('stale_guard.changed', {
        source: 'responsebox-size',
        reason: 'surface-not-owner',
        previousGuardRef: activeGuardRef,
        nextGuardRef: null,
        turnRef: normalizedTurnRef,
      });
    }
    if (responseWindow.isVisible()) {
      responseWindow.hide();
      logLiveSurfaceTrace('response_overlay.window.hide', {
        source: 'responsebox-size',
        reason: 'surface-not-owner',
        turnRef: normalizedTurnRef,
        guardRef: normalizedStaleGuardRef,
        phase: getResponseOverlayPhase(),
        responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      });
    }
    appendSurfaceVisibilityDiagnostic({
      action: 'suppress-size-show-for-surface-owner',
      phase: getResponseOverlayPhase(),
      requestedVisible: true,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
      activeGuardRef: activeGuardRef,
      responseWindowVisible: safeWindowVisible(responseWindow),
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
    });
    logChatPillMainTrace({
      source: 'responsebox-size',
      action: 'suppress-show-surface-not-owner',
      phase: getResponseOverlayPhase(),
      responseWindow,
      responseOverlayVisibleFlag: false,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
      activeGuardRef,
    }, deps);
    logLiveSurfaceTrace('response_overlay.window.show_ignored', {
      source: 'responsebox-size',
      reason: 'surface-not-owner',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      phase: getResponseOverlayPhase(),
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      responseOverlayVisible: getResponseOverlayVisible(),
    });
    return {
      success: true,
      visible: false,
      ignored: true,
      reason: 'surface-not-owner',
    };
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
      setResponseOverlayLayoutMode(normalizedStaleGuardRef, 'response');
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
      appendSurfaceVisibilityDiagnostic({
        action: 'show-fullscreen-from-size',
        phase: getResponseOverlayPhase(),
        requestedVisible: true,
        turnRef: normalizedTurnRef,
        staleGuardRef: normalizedStaleGuardRef,
        responseWindowVisible: safeWindowVisible(responseWindow),
        responseOverlayVisibleFlag: getResponseOverlayVisible(),
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

  const currentLayoutMode = normalizedStaleGuardRef
    ? normalizeResponseboxLayoutMode(getResponseOverlayLayoutMode(normalizedStaleGuardRef))
    : null;
  if (shouldIgnoreRegressiveLayoutMode({
    incomingLayoutMode,
    currentLayoutMode,
    staleGuardRef: normalizedStaleGuardRef,
  })) {
    appendSurfaceVisibilityDiagnostic({
      action: 'ignore-regressive-response-layout-from-size',
      phase: getResponseOverlayPhase(),
      requestedVisible: true,
      responseLayoutMode: incomingLayoutMode,
      activeResponseLayoutMode: currentLayoutMode,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
      responseWindowVisible: safeWindowVisible(responseWindow),
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
    });
    logChatPillMainTrace({
      source: 'responsebox-size',
      action: 'ignore-regressive-layout',
      phase: getResponseOverlayPhase(),
      responseWindow,
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
      responseLayoutMode: incomingLayoutMode,
      activeResponseLayoutMode: currentLayoutMode,
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
    }, deps);
    logLiveSurfaceTrace('response_overlay.window.resize_ignored', {
      source: 'responsebox-size',
      reason: 'regressive-layout-mode',
      turnRef: normalizedTurnRef,
      guardRef: normalizedStaleGuardRef,
      phase: getResponseOverlayPhase(),
      responseLayoutMode: incomingLayoutMode,
      activeResponseLayoutMode: currentLayoutMode,
      responseWindow: summarizeWindow(responseWindow, 'response overlay'),
      responseOverlayVisible: getResponseOverlayVisible(),
    });
    return {
      success: true,
      visible: true,
      ignored: true,
      reason: 'regressive-layout-mode',
    };
  }

  const nextWidth = Math.max(1, Math.min(900, Math.round(Number(width) || 0)));
  const nextHeight = Math.max(1, Math.min(750, Math.round(Number(height) || 0)));
  try {
    const bounds = compactHover
      ? getResponseWindowBounds(nextWidth, nextHeight, { compactHover: true })
      : getResponseWindowBounds(nextWidth, nextHeight);
    responseWindow.setBounds(bounds, false);
    setResponseOverlayLayoutMode(normalizedStaleGuardRef, incomingLayoutMode);
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
    appendSurfaceVisibilityDiagnostic({
      action: 'show-or-resize-from-size',
      phase: getResponseOverlayPhase(),
      requestedVisible: true,
      responseWindowVisible: safeWindowVisible(responseWindow),
      responseOverlayVisibleFlag: getResponseOverlayVisible(),
      responseLayoutMode: compactHover ? 'awaiting-typing' : 'response',
      turnRef: normalizedTurnRef,
      staleGuardRef: normalizedStaleGuardRef,
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
