/**
 * Provides the ipc renderer windows module for the Electron main process.
 */

const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc_desktop_runtime_channels.cjs');
const {
  isDebugFlagEnabled,
} = require('../app/debug_env.cjs');

function isDebugStreamTraceEnabled() {
  return isDebugFlagEnabled('streamEvents');
}

function readExactNonEmptyString(value) {
  return typeof value === 'string' && value && value.trim() === value ? value : null;
}

function isSdkConversationView(conversationView) {
  return Boolean(
    conversationView
      && typeof conversationView === 'object'
      && !Array.isArray(conversationView)
      && readExactNonEmptyString(conversationView.conversationRef)
      && Array.isArray(conversationView.displayRows)
      && conversationView.liveTurn
      && typeof conversationView.liveTurn === 'object'
      && !Array.isArray(conversationView.liveTurn)
      && conversationView.surfaces
      && typeof conversationView.surfaces === 'object'
      && !Array.isArray(conversationView.surfaces)
      && conversationView.actions
      && typeof conversationView.actions === 'object'
      && !Array.isArray(conversationView.actions)
  );
}

function trackRendererWindow({
  win,
  rendererWindows,
  getResponseOverlayPhase,
  getLatestCurrentTurn = null,
  getLatestConversationView = null,
  getLatestPendingTurn = null,
  getReplayEvents = null,
  buildConversationEvent = null,
}) {
  if (!win || (win.isDestroyed && win.isDestroyed())) {
    return;
  }
  rendererWindows.add(win);
  const webContents = win.webContents;
  const canSubscribeToLoad = Boolean(
    webContents
      && typeof webContents.on === 'function'
      && typeof webContents.removeListener === 'function',
  );
  const canCheckLoadingState = Boolean(
    webContents && typeof webContents.isLoadingMainFrame === 'function',
  );
  const syncRendererRuntimeState = () => {
    if (!win || win.isDestroyed()) {
      return;
    }
    if (!webContents || typeof webContents.send !== 'function') {
      return;
    }
    webContents.send('response-overlay-phase', {
      phase: getResponseOverlayPhase(),
      source: 'sync',
    });
    const latestCurrentTurn = typeof getLatestCurrentTurn === 'function'
      ? getLatestCurrentTurn()
      : null;
    const latestConversationView = typeof getLatestConversationView === 'function'
      ? getLatestConversationView()
      : null;
    const sdkConversationView = isSdkConversationView(latestConversationView)
      ? latestConversationView
      : null;
    if (
      (latestCurrentTurn && typeof latestCurrentTurn === 'object')
      || sdkConversationView
    ) {
      webContents.send(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN, {
        conversationRef: (
          sdkConversationView?.conversationRef
          || latestCurrentTurn?.conversationRef
          || null
        ),
        currentTurn: latestCurrentTurn && typeof latestCurrentTurn === 'object'
          ? latestCurrentTurn
          : null,
        view: sdkConversationView,
      });
    }
    if (typeof getLatestPendingTurn === 'function') {
      const latestPendingTurn = getLatestPendingTurn();
      if (latestPendingTurn && typeof latestPendingTurn === 'object') {
        webContents.send(DESKTOP_RUNTIME_ON_CHANNELS.PENDING_TURN, {
          type: 'pending',
          pendingTurn: latestPendingTurn,
        });
      }
    }
    if (typeof getReplayEvents !== 'function') {
      return;
    }
    const replayEvents = getReplayEvents();
    if (!Array.isArray(replayEvents) || replayEvents.length === 0) {
      return;
    }
    for (const replayEvent of replayEvents) {
      if (typeof buildConversationEvent === 'function') {
        const conversationEvent = buildConversationEvent(replayEvent);
        if (conversationEvent) {
          webContents.send(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, conversationEvent);
        }
      }
    }
  };
  if (canSubscribeToLoad) {
    webContents.on('did-finish-load', syncRendererRuntimeState);
  }
  if (!canCheckLoadingState || !webContents.isLoadingMainFrame()) {
    syncRendererRuntimeState();
  }
  if (typeof win.on !== 'function') {
    return;
  }
  win.on('closed', () => {
    if (canSubscribeToLoad) {
      webContents.removeListener('did-finish-load', syncRendererRuntimeState);
    }
    rendererWindows.delete(win);
  });
}

function broadcastToRenderers({
  rendererWindows,
  channel,
  payload,
  sourceWebContents = null,
}) {
  let deliveredCount = 0;
  for (const win of rendererWindows) {
    if (!win || win.isDestroyed()) {
      rendererWindows.delete(win);
      continue;
    }
    if (sourceWebContents && win.webContents === sourceWebContents) {
      continue;
    }
    win.webContents.send(channel, payload);
    deliveredCount += 1;
  }
  if (
    isDebugStreamTraceEnabled()
    && channel === DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT
    && payload
    && typeof payload === 'object'
  ) {
    const eventType = typeof payload.type === 'string' ? payload.type : 'unknown';
    const turnRef = typeof payload.turn_ref === 'string' ? payload.turn_ref : '-';
    const conversationRef = typeof payload.conversation_ref === 'string' ? payload.conversation_ref : '-';
    console.log(
      `[Main][IPC][StreamTrace] broadcast channel=${channel} type=${eventType} turn=${turnRef} conv=${conversationRef} renderer_count=${deliveredCount}`,
    );
  }
}

function createRendererWindowRegistry() {
  const rendererWindows = new Set();

  function track(input = {}) {
    return trackRendererWindow({
      ...input,
      rendererWindows,
    });
  }

  function broadcast(input = {}) {
    return broadcastToRenderers({
      ...input,
      rendererWindows,
    });
  }

  function reset() {
    rendererWindows.clear();
  }

  function size() {
    return rendererWindows.size;
  }

  return {
    broadcast,
    reset,
    size,
    track,
  };
}

function createRendererWindowRuntime({
  registry = createRendererWindowRegistry(),
  getResponseOverlayPhase,
  getLatestCurrentTurn = null,
  getLatestConversationView = null,
  getLatestPendingTurn = null,
  getReplayEvents = null,
  buildConversationEvent = null,
} = {}) {
  function track(win) {
    return registry.track({
      win,
      getResponseOverlayPhase,
      getLatestCurrentTurn,
      getLatestConversationView,
      getLatestPendingTurn,
      getReplayEvents,
      buildConversationEvent,
    });
  }

  function broadcast(channel, payload, sourceWebContents = null) {
    return registry.broadcast({
      channel,
      payload,
      sourceWebContents,
    });
  }

  function reset() {
    return registry.reset();
  }

  function size() {
    return registry.size();
  }

  return {
    broadcast,
    reset,
    size,
    track,
  };
}

module.exports = {
  createRendererWindowRuntime,
};
