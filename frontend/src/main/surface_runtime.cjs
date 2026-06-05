const { createOverlayWindowHelpersRuntime } = require('./overlay_window_helpers_runtime.cjs');
const {
  handleResponseOverlayPhaseEvent,
  isStreamingResponseOverlayPhase,
} = require('./response_overlay_phase_handler.cjs');
const {
  broadcastResponseOverlayVisibility: broadcastResponseOverlayVisibilityRuntime,
  emitWakewordSttTrigger: emitWakewordSttTriggerRuntime,
  setResponseOverlayVisibilityState: setResponseOverlayVisibilityStateRuntime,
  syncWakewordToggleForChatVisibility: syncWakewordToggleForChatVisibilityRuntime,
} = require('./overlay_signal_runtime.cjs');
const {
  hideMainWindow: hideMainWindowRuntime,
  hideChatWindow: hideChatWindowRuntime,
  showChatWindow: showChatWindowRuntime,
  showMainWindow: showMainWindowRuntime,
} = require('./window_visibility_runtime.cjs');
const {
  normalizeChatSurfaceWindowOptions,
  normalizeMainSurfaceWindowOptions,
} = require('./surface_window_options_runtime.cjs');
const {
  emitMainWindowOpenTarget: emitMainWindowOpenTargetRuntime,
  normalizeMainWindowOpenTarget: normalizeMainWindowOpenTargetRuntime,
  prepareOverlayQueryCaptureFocus: prepareOverlayQueryCaptureFocusRuntime,
} = require('./main_window_runtime.cjs');

const CHAT_PILL_SHOW_REASON = Object.freeze({
  APP_ACTIVATE: 'app-activate',
  DASHBOARD_CLOSE: 'dashboard-close',
  HOTKEY: 'hotkey',
  STARTUP: 'startup',
  WAKEWORD: 'wakeword',
});

const CHAT_PILL_HIDE_REASON = Object.freeze({
  USER: 'user',
});

const GENERIC_CHAT_PILL_SHOW_REASONS = new Set([
  CHAT_PILL_SHOW_REASON.APP_ACTIVATE,
  CHAT_PILL_SHOW_REASON.STARTUP,
  'second-instance',
]);

const USER_SUMMON_CHAT_PILL_SHOW_REASONS = new Set([
  CHAT_PILL_SHOW_REASON.DASHBOARD_CLOSE,
  CHAT_PILL_SHOW_REASON.HOTKEY,
  CHAT_PILL_SHOW_REASON.WAKEWORD,
  'manual',
  'onboarding-complete',
  'tray',
  'user',
]);

function normalizeChatPillReason(value, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || fallback;
}

function createSurfaceRuntime({
  screen,
  platform = process.platform,
  getActiveDisplayAffinity,
  setActiveDisplayAffinity,
  syncActiveDisplayAffinityForWindow,
  getOverlayChatWindowBounds,
  getOverlayResponseWindowBounds,
  getOverlayContextLabelWindowBounds,
  contextLabelWidth,
  contextLabelHeight,
  contextLabelOffsetX,
  contextLabelGapAboveChatbox,
  responseGap,
  initialChatVisualAnchorHeight = 64,
  responseOverlayPhaseEnum,
  enableOsToolGhostDebug = false,
  mainWindowOpenTargetChannel,
  mainWindowOpenTargets,
  windowPlatformPolicy,
  initialChatPillUserHidden = false,
  persistChatPillUserHidden = () => {},
  toolSurfaceSettleMs = 80,
  log = console.log,
  warn = console.warn,
} = {}) {
  const state = {
    mainWindow: null,
    chatWindow: null,
    responseWindow: null,
    contextLabelWindow: null,
    vmWorkerRuntime: null,
    mainProcessIpcHandlersInitialized: false,
    responseOverlayVisible: false,
    responseOverlayPhase: 'idle',
    activeResponseOverlayCorrelationId: null,
    chatVisualAnchorHeight: initialChatVisualAnchorHeight,
    chatboxHitTestActive: false,
    chatPillUserHidden: initialChatPillUserHidden === true,
    startupChatPillShowHandled: false,
    primarySurface: 'dashboard',
    mainWindowMode: 'dashboard',
  };

  function getWindows() {
    return {
      mainWindow: state.mainWindow,
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      contextLabelWindow: state.contextLabelWindow,
    };
  }

  function getState() {
    return {
      windows: getWindows(),
      vmWorkerRuntime: state.vmWorkerRuntime,
      responseOverlayPhase: state.responseOverlayPhase,
      chatPillUserHidden: state.chatPillUserHidden,
      applyResponseOverlayPhase,
      setResponseOverlayVisible: (nextVisible) => {
        state.responseOverlayVisible = Boolean(nextVisible);
      },
    };
  }

  function syncWindowDisplayAffinity(targetWindow) {
    return syncActiveDisplayAffinityForWindow(screen, targetWindow);
  }

  function prepareOverlayQueryCaptureFocus(options = {}) {
    const waitMs = typeof options?.waitMs === 'number' ? options.waitMs : 120;
    return prepareOverlayQueryCaptureFocusRuntime({
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      mainWindow: state.mainWindow,
      waitMs,
    });
  }

  function enableContentProtectionSafely(targetWindowOrOptions, windowLabel) {
    const options = (
      targetWindowOrOptions
      && typeof targetWindowOrOptions === 'object'
      && !Array.isArray(targetWindowOrOptions)
      && Object.prototype.hasOwnProperty.call(targetWindowOrOptions, 'targetWindow')
    )
      ? targetWindowOrOptions
      : { targetWindow: targetWindowOrOptions, windowLabel };

    windowPlatformPolicy.applyContentProtection({
      targetWindow: options.targetWindow,
      windowLabel: options.windowLabel,
    });
  }

  function applyOverlayWindowPolicy(targetWindowOrOptions, windowLabel) {
    const options = (
      targetWindowOrOptions
      && typeof targetWindowOrOptions === 'object'
      && !Array.isArray(targetWindowOrOptions)
      && Object.prototype.hasOwnProperty.call(targetWindowOrOptions, 'targetWindow')
    )
      ? targetWindowOrOptions
      : { targetWindow: targetWindowOrOptions, windowLabel };

    windowPlatformPolicy.applyOverlayWindowPolicy({
      targetWindow: options.targetWindow,
      windowLabel: options.windowLabel,
    });
  }

  const overlayHelpers = createOverlayWindowHelpersRuntime({
    screen,
    getActiveDisplayAffinity,
    getChatWindow: () => state.chatWindow,
    getResponseWindow: () => state.responseWindow,
    getContextLabelWindow: () => state.contextLabelWindow,
    getResponseOverlayVisible: () => state.responseOverlayVisible,
    getOverlayChatWindowBounds,
    getOverlayResponseWindowBounds,
    getOverlayContextLabelWindowBounds,
    contextLabelWidth,
    contextLabelHeight,
    contextLabelOffsetX,
    contextLabelGapAboveChatbox,
    responseGap,
    getChatVisualAnchorHeight: () => state.chatVisualAnchorHeight,
    warn,
  });

  function setChatVisualAnchorHeight(height) {
    const nextHeight = Math.round(Number(height));
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return false;
    }
    if (nextHeight === state.chatVisualAnchorHeight) {
      return false;
    }
    state.chatVisualAnchorHeight = nextHeight;
    return true;
  }

  function setChatboxHitTestActive(active) {
    const nextActive = active === true;
    if (nextActive === state.chatboxHitTestActive) {
      return false;
    }
    state.chatboxHitTestActive = nextActive;
    return true;
  }

  function syncChatboxHitTestState() {
    const chatWindow = state.chatWindow;
    if (!chatWindow || chatWindow.isDestroyed()) {
      return false;
    }

    const shouldIgnoreMouse = (
      isResponseOverlayStreamingPhaseForState()
      || !state.chatboxHitTestActive
    );

    try {
      if (shouldIgnoreMouse) {
        chatWindow.setIgnoreMouseEvents(true, { forward: true });
      } else {
        chatWindow.setIgnoreMouseEvents(false);
      }
      return true;
    } catch (error) {
      warn('[Main] Failed to sync chatbox hit-test state:', error?.message || error);
      return false;
    }
  }

  function safeSetWindowPointerPolicy(win, {
    ignoreMouseEvents,
    focusable,
    forward = true,
  } = {}) {
    if (!win || win.isDestroyed()) {
      return false;
    }
    try {
      if (ignoreMouseEvents === true) {
        win.setIgnoreMouseEvents(true, { forward });
      } else if (ignoreMouseEvents === false) {
        win.setIgnoreMouseEvents(false);
      }
      if (typeof win.setFocusable === 'function' && typeof focusable === 'boolean') {
        win.setFocusable(focusable);
      }
      return true;
    } catch (error) {
      warn('[Main] Failed to apply tool surface pointer policy:', error?.message || error);
      return false;
    }
  }

  function delayToolSurfaceSettle() {
    const delayMs = Math.max(0, Math.round(Number(toolSurfaceSettleMs) || 0));
    if (delayMs <= 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  async function beginPointerControlLease() {
    showChatWindow({
      focus: false,
      restoreResponseOverlay: true,
      reason: 'tool-pointer-control',
    });
    overlayHelpers.ensureChatWindowOnTop();
    for (const win of [state.chatWindow, state.responseWindow, state.contextLabelWindow]) {
      safeSetWindowPointerPolicy(win, {
        ignoreMouseEvents: true,
        focusable: false,
      });
    }
    return async () => {
      syncChatboxHitTestState();
      for (const win of [state.responseWindow, state.contextLabelWindow]) {
        safeSetWindowPointerPolicy(win, {
          ignoreMouseEvents: true,
          focusable: false,
        });
      }
    };
  }

  function visibleCaptureWindows() {
    return [state.chatWindow, state.responseWindow]
      .filter(win => win && !win.isDestroyed() && win.isVisible());
  }

  async function beginScreenshotCaptureLease() {
    const captureWindows = visibleCaptureWindows();
    if (platform === 'linux') {
      for (const win of captureWindows) {
        try {
          win.hide();
        } catch (error) {
          warn('[Main] Failed to hide overlay for screenshot:', error?.message || error);
        }
      }
      await delayToolSurfaceSettle();
      return async () => {
        for (const win of captureWindows) {
          if (!win || win.isDestroyed()) {
            continue;
          }
          try {
            if (typeof win.showInactive === 'function') {
              win.showInactive();
            } else {
              win.show();
            }
          } catch (error) {
            warn('[Main] Failed to restore overlay after screenshot:', error?.message || error);
          }
        }
      };
    }

    for (const [targetWindow, windowLabel] of [
      [state.chatWindow, 'chat box'],
      [state.responseWindow, 'response overlay'],
    ]) {
      if (!targetWindow || targetWindow.isDestroyed()) {
        continue;
      }
      windowPlatformPolicy.applyContentProtection({
        targetWindow,
        windowLabel,
        enabled: true,
      });
    }
    await delayToolSurfaceSettle();
    return async () => {
      for (const [targetWindow, windowLabel] of [
        [state.chatWindow, 'chat box'],
        [state.responseWindow, 'response overlay'],
      ]) {
        if (!targetWindow || targetWindow.isDestroyed()) {
          continue;
        }
        windowPlatformPolicy.applyContentProtection({
          targetWindow,
          windowLabel,
          enabled: false,
        });
      }
    };
  }

  function syncWakewordToggleForChatVisibility() {
    syncWakewordToggleForChatVisibilityRuntime({
      mainWindow: state.mainWindow,
      chatWindow: state.chatWindow,
    });
  }

  function emitWakewordSttTrigger() {
    emitWakewordSttTriggerRuntime({
      chatWindow: state.chatWindow,
      channel: 'wakeword-stt-trigger',
    });
  }

  function broadcastResponseOverlayVisibility(visible = state.responseOverlayVisible) {
    broadcastResponseOverlayVisibilityRuntime({
      visible,
      windows: [
        state.mainWindow,
        state.chatWindow,
        state.responseWindow,
        state.contextLabelWindow,
      ],
    });
  }

  function setResponseOverlayVisibilityState(visible) {
    setResponseOverlayVisibilityStateRuntime(visible, {
      setResponseOverlayVisible: (nextVisible) => {
        state.responseOverlayVisible = Boolean(nextVisible);
      },
      broadcastResponseOverlayVisibility,
      syncContextLabelWindowVisibility: overlayHelpers.syncContextLabelWindowVisibility,
    });
  }

  function isResponseOverlayStreamingPhaseForState() {
    return isStreamingResponseOverlayPhase(
      state.responseOverlayPhase,
      responseOverlayPhaseEnum,
    );
  }

  function setChatPillUserHidden(userHidden) {
    const nextUserHidden = userHidden === true;
    if (state.chatPillUserHidden === nextUserHidden) {
      return false;
    }
    state.chatPillUserHidden = nextUserHidden;
    try {
      persistChatPillUserHidden(nextUserHidden);
    } catch (error) {
      warn('[Main] Failed to persist chat pill visibility intent:', error?.message || error);
    }
    logChatPillVisibilityDecision({
      action: 'user-hidden-state-changed',
      userHidden: nextUserHidden,
    }, { log });
    return true;
  }

  function shouldSuppressChatPillShow(options = {}) {
    const reason = normalizeChatPillReason(options?.reason, 'unspecified');
    if (reason === CHAT_PILL_SHOW_REASON.STARTUP && state.startupChatPillShowHandled) {
      return true;
    }
    if (!state.chatPillUserHidden) {
      return false;
    }
    return GENERIC_CHAT_PILL_SHOW_REASONS.has(reason);
  }

  function showChatWindow(options = {}) {
    const reason = normalizeChatPillReason(options?.reason, 'unspecified');
    if (shouldSuppressChatPillShow(options)) {
      const resultReason = reason === CHAT_PILL_SHOW_REASON.STARTUP && state.startupChatPillShowHandled
        ? 'startup-surface-already-applied'
        : 'chat-pill-user-hidden';
      logChatPillVisibilityDecision({
        action: 'show-suppressed',
        reason,
        userHidden: state.chatPillUserHidden,
        focus: options?.focus !== false,
        restoreResponseOverlay: options?.restoreResponseOverlay === true,
        resultReason,
      }, { log });
      return {
        success: true,
        suppressed: true,
        reason: resultReason,
      };
    }
    const result = showChatWindowRuntime(normalizeChatSurfaceWindowOptions(options), {
      chatWindow: state.chatWindow,
      mainWindow: state.mainWindow,
      responseWindow: state.responseWindow,
      positionChatWindow: overlayHelpers.positionChatWindow,
      responseOverlayVisible: state.responseOverlayVisible,
      isResponseOverlayStreamingPhase: isResponseOverlayStreamingPhaseForState,
      setResponseOverlayVisible: (nextVisible) => {
        state.responseOverlayVisible = Boolean(nextVisible);
      },
      ensureChatWindowOnTop: overlayHelpers.ensureChatWindowOnTop,
      ensureResponseOverlayFallbackBounds: overlayHelpers.ensureResponseOverlayFallbackBounds,
      showResponseWindowInactive: overlayHelpers.showResponseWindowInactive,
      broadcastResponseOverlayVisibility,
      syncContextLabelWindowVisibility: overlayHelpers.syncContextLabelWindowVisibility,
      syncWakewordToggleForChatVisibility,
      syncWindowDisplayAffinity,
      syncChatboxHitTestState,
      setActiveDisplayAffinity,
      getActiveDisplayAffinity,
      getResponseOverlayPhase: () => state.responseOverlayPhase,
    });
    if (result?.success) {
      if (reason === CHAT_PILL_SHOW_REASON.STARTUP) {
        state.startupChatPillShowHandled = true;
      }
      if (USER_SUMMON_CHAT_PILL_SHOW_REASONS.has(reason)) {
        setChatPillUserHidden(false);
      }
      state.primarySurface = 'chat';
    }
    logChatPillVisibilityDecision({
      action: result?.success ? 'show-applied' : 'show-failed',
      reason,
      userHidden: state.chatPillUserHidden,
      focus: options?.focus !== false,
      restoreResponseOverlay: options?.restoreResponseOverlay === true,
      resultReason: typeof result?.reason === 'string' ? result.reason : null,
      chatWindowVisible: safeWindowVisible(state.chatWindow),
      responseWindowVisible: safeWindowVisible(state.responseWindow),
    }, { log });
    return result;
  }

  function hideChatWindow(options = {}) {
    const reason = normalizeChatPillReason(options?.reason, null);
    if (reason === CHAT_PILL_HIDE_REASON.USER) {
      setChatPillUserHidden(true);
    }
    const result = hideChatWindowRuntime({
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      contextLabelWindow: state.contextLabelWindow,
      broadcastResponseOverlayVisibility,
      syncWakewordToggleForChatVisibility,
      getResponseOverlayPhase: () => state.responseOverlayPhase,
    });
    logChatPillVisibilityDecision({
      action: result?.success ? 'hide-applied' : 'hide-failed',
      reason: reason || 'unspecified',
      userHidden: state.chatPillUserHidden,
      resultReason: typeof result?.reason === 'string' ? result.reason : null,
      chatWindowVisible: safeWindowVisible(state.chatWindow),
      responseWindowVisible: safeWindowVisible(state.responseWindow),
    }, { log });
    return result;
  }

  function hideMainWindow(options = {}) {
    return hideMainWindowRuntime(options, {
      mainWindow: state.mainWindow,
    });
  }

  function showMainWindow(options = {}) {
    const normalizedOptions = normalizeMainSurfaceWindowOptions(options);
    const reason = normalizeChatPillReason(normalizedOptions.reason, 'show-main-window');
    const nextMainWindowMode = normalizedOptions.open === 'onboarding'
      ? 'onboarding'
      : 'dashboard';
    const result = showMainWindowRuntime(normalizedOptions, {
      mainWindow: state.mainWindow,
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      contextLabelWindow: state.contextLabelWindow,
      syncWindowDisplayAffinity,
      setActiveDisplayAffinity,
      getActiveDisplayAffinity,
      hideChatWindow: (hideOptions = {}) => hideChatWindow({
        reason: `surface-handoff:${reason}`,
        ...hideOptions,
      }),
      activateWindowForInteraction: windowPlatformPolicy.activateWindowForInteraction,
    });
    if (result?.success) {
      state.mainWindowMode = nextMainWindowMode;
      state.primarySurface = nextMainWindowMode;
      state.startupChatPillShowHandled = true;
    }
    return result;
  }

  function getPrimarySurface() {
    return state.primarySurface;
  }

  function getMainWindowMode() {
    return state.mainWindowMode;
  }

  function normalizeMainWindowOpenTarget(options = {}) {
    return normalizeMainWindowOpenTargetRuntime({
      options,
      allowedTargets: mainWindowOpenTargets,
    });
  }

  function emitMainWindowOpenTarget(target) {
    emitMainWindowOpenTargetRuntime({
      target,
      mainWindow: state.mainWindow,
      channel: mainWindowOpenTargetChannel,
    });
  }

  function applyResponseOverlayPhase(event = {}) {
    handleResponseOverlayPhaseEvent(event, {
      ENABLE_OS_TOOL_GHOST_DEBUG: enableOsToolGhostDebug,
      RESPONSE_OVERLAY_PHASE: responseOverlayPhaseEnum,
      setResponseOverlayPhase: (nextPhase) => {
        state.responseOverlayPhase = nextPhase;
      },
      getResponseOverlayVisible: () => state.responseOverlayVisible,
      getResponseOverlayPhase: () => state.responseOverlayPhase,
      getActiveResponseOverlayCorrelationId: () => state.activeResponseOverlayCorrelationId,
      setActiveResponseOverlayCorrelationId: (nextCorrelationId) => {
        state.activeResponseOverlayCorrelationId = nextCorrelationId;
      },
      getChatboxHitTestActive: () => state.chatboxHitTestActive,
      setResponseOverlayVisibilityState,
      applyOverlayContentProtection: (options = {}) => {
        windowPlatformPolicy.applyContentProtection(options);
      },
      responseWindow: state.responseWindow,
      chatWindow: state.chatWindow,
      contextLabelWindow: state.contextLabelWindow,
      ensureResponseOverlayFallbackBounds: overlayHelpers.ensureResponseOverlayFallbackBounds,
      showResponseWindowWhenChatVisible: overlayHelpers.showResponseWindowWhenChatVisible,
      showResponseWindowInactive: overlayHelpers.showResponseWindowInactive,
      syncContextLabelWindowVisibility: overlayHelpers.syncContextLabelWindowVisibility,
      warn,
    });
  }

  function initializeMainProcessIpcOnce(initializer) {
    if (state.mainProcessIpcHandlersInitialized) {
      return false;
    }
    initializer();
    state.mainProcessIpcHandlersInitialized = true;
    return true;
  }

  function stopVmWorker() {
    if (state.vmWorkerRuntime) {
      state.vmWorkerRuntime.stop();
      state.vmWorkerRuntime = null;
      return true;
    }
    return false;
  }

  return {
    applyOverlayWindowPolicy,
    applyResponseOverlayPhase,
    broadcastResponseOverlayVisibility,
    beginPointerControlLease,
    beginScreenshotCaptureLease,
    emitMainWindowOpenTarget,
    emitWakewordSttTrigger,
    enableContentProtectionSafely,
    getChatWindow: () => state.chatWindow,
    getContextLabelWindow: () => state.contextLabelWindow,
    getMainWindow: () => state.mainWindow,
    getMainWindowMode,
    getPrimarySurface,
    getResponseWindow: () => state.responseWindow,
    getState,
    getWindows,
    hideChatWindow,
    hideMainWindow,
    initializeMainProcessIpcOnce,
    normalizeMainWindowOpenTarget,
    overlayHelpers,
    prepareOverlayQueryCaptureFocus,
    setChatPillUserHidden,
    setChatboxHitTestActive,
    setChatVisualAnchorHeight,
    setChatWindow: (nextWindow) => {
      state.chatWindow = nextWindow;
    },
    setContextLabelWindow: (nextWindow) => {
      state.contextLabelWindow = nextWindow;
    },
    setMainWindow: (nextWindow) => {
      state.mainWindow = nextWindow;
    },
    setResponseOverlayVisibilityState,
    setResponseWindow: (nextWindow) => {
      state.responseWindow = nextWindow;
    },
    setVmWorkerRuntime: (nextRuntime) => {
      state.vmWorkerRuntime = nextRuntime;
    },
    showChatWindow,
    showMainWindow,
    stopVmWorker,
    syncChatboxHitTestState,
    syncWakewordToggleForChatVisibility,
    syncWindowDisplayAffinity,
  };
}

function safeWindowVisible(win) {
  if (!win || typeof win !== 'object') {
    return null;
  }
  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) {
    return null;
  }
  return typeof win.isVisible === 'function' ? Boolean(win.isVisible()) : null;
}

function logChatPillVisibilityDecision(event = {}, deps = {}) {
  const { log = console.log } = deps;
  const payload = {
    action: normalizeChatPillReason(event.action, 'unknown'),
    reason: normalizeChatPillReason(event.reason, null),
    user_hidden: event.userHidden === true,
    focus: typeof event.focus === 'boolean' ? event.focus : null,
    restore_response_overlay: typeof event.restoreResponseOverlay === 'boolean'
      ? event.restoreResponseOverlay
      : null,
    result_reason: normalizeChatPillReason(event.resultReason, null),
    chat_window_visible: typeof event.chatWindowVisible === 'boolean'
      ? event.chatWindowVisible
      : null,
    response_window_visible: typeof event.responseWindowVisible === 'boolean'
      ? event.responseWindowVisible
      : null,
  };
  log('[ChatPillVisibility][main]', payload);
}

module.exports = {
  CHAT_PILL_HIDE_REASON,
  CHAT_PILL_SHOW_REASON,
  logChatPillVisibilityDecision,
  createSurfaceRuntime,
};
