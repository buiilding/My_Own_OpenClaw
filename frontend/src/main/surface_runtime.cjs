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

function createSurfaceRuntime({
  screen,
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
    chatVisualAnchorHeight: initialChatVisualAnchorHeight,
    chatboxHitTestActive: false,
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

  function showChatWindow(options = {}) {
    state.primarySurface = 'chat';
    return showChatWindowRuntime(normalizeChatSurfaceWindowOptions(options), {
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
  }

  function hideChatWindow() {
    return hideChatWindowRuntime({
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      contextLabelWindow: state.contextLabelWindow,
      broadcastResponseOverlayVisibility,
      syncWakewordToggleForChatVisibility,
      getResponseOverlayPhase: () => state.responseOverlayPhase,
    });
  }

  function hideMainWindow(options = {}) {
    return hideMainWindowRuntime(options, {
      mainWindow: state.mainWindow,
    });
  }

  function showMainWindow(options = {}) {
    const normalizedOptions = normalizeMainSurfaceWindowOptions(options);
    state.mainWindowMode = normalizedOptions.open === 'onboarding'
      ? 'onboarding'
      : 'dashboard';
    state.primarySurface = state.mainWindowMode;
    return showMainWindowRuntime(normalizedOptions, {
      mainWindow: state.mainWindow,
      chatWindow: state.chatWindow,
      responseWindow: state.responseWindow,
      contextLabelWindow: state.contextLabelWindow,
      syncWindowDisplayAffinity,
      setActiveDisplayAffinity,
      getActiveDisplayAffinity,
      hideChatWindow,
      activateWindowForInteraction: windowPlatformPolicy.activateWindowForInteraction,
    });
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
    state.mainProcessIpcHandlersInitialized = true;
    initializer();
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
    setChatboxHitTestActive,
    prepareOverlayQueryCaptureFocus,
    setChatVisualAnchorHeight,
    setChatWindow: (nextWindow) => {
      state.chatWindow = nextWindow;
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

module.exports = {
  createSurfaceRuntime,
};
