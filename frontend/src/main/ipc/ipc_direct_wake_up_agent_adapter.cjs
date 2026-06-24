/**
 * Adapts a direct AgentClient wakeUp result to Electron agent-host methods.
 */

const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('./ipc_desktop_runtime_channels.cjs');

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveSdkCommandConversationRef(input = {}) {
  if (typeof input === 'string') {
    return normalizeOptionalString(input);
  }
  if (!isPlainObject(input)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'conversation_ref')) {
    throw new Error('Agent SDK conversation commands require conversationRef; conversation_ref is not supported.');
  }
  return normalizeOptionalString(input.conversationRef);
}

function createDirectWakeUpAgentAdapter({
  agent,
  workspacePath = null,
  store = null,
  deps = {},
} = {}) {
  if (!agent || typeof agent !== 'object') {
    throw new Error('Direct wake-up adapter requires an Agent instance');
  }
  const {
    broadcastToRenderers,
    resolveRuntimeConversationRef,
    setLatestCurrentTurnProjection,
    setLatestConversationView,
    getLatestPendingTurn,
    pendingTurnMatchesCurrentTurn,
    clearLatestPendingTurn,
    logLiveSurfaceTrace,
    summarizeCurrentTurn,
    isDebugFlagEnabled,
    currentTurnTraceLogger,
    getSyncSdkLiveTurnSurfaceIntent,
    log,
    buildConversationTerminalStatus,
    resolveWorkspacePathForAgent,
    handleAgentBackendEvent,
    refreshMcpServersForConfig,
    getMcpClientInfo,
  } = deps;
  if (typeof broadcastToRenderers !== 'function') {
    throw new Error('Direct wake-up adapter requires broadcastToRenderers');
  }
  if (typeof resolveRuntimeConversationRef !== 'function') {
    throw new Error('Direct wake-up adapter requires resolveRuntimeConversationRef');
  }

  const defaultConversationRef = `conv-${agent.id}`;
  const runtimeHandles = new Map();
  let detachBackendEventSubscription = () => {};
  let closed = false;

  function broadcastStatus(status) {
    broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.STATUS, status);
  }

  function createRuntimeHandle(nextConversationRef) {
    const runtimeConversationRef = normalizeOptionalString(nextConversationRef) || defaultConversationRef;
    const runtime = agent.conversation({
      conversationRef: runtimeConversationRef,
      ...(store ? { store } : {}),
    });
    const handle = {
      conversationRef: runtimeConversationRef,
      runtime,
      detachRuntimeEvents: () => {},
      latestSnapshot: null,
      activeTurnRef: null,
      sendInFlight: false,
      terminal: false,
      inferenceContextReady: false,
      inferenceContextPromise: null,
    };
    handle.detachRuntimeEvents = runtime.subscribeEvents((event, snapshot = {}) => {
      handle.latestSnapshot = snapshot;
      if (snapshot?.currentTurn?.turnRef) {
        handle.activeTurnRef = snapshot.currentTurn.turnRef;
      }
      const phase = snapshot?.currentTurn?.phase;
      if (phase === 'complete' || phase === 'error' || phase === 'idle') {
        handle.sendInFlight = false;
        handle.terminal = true;
      } else if (phase) {
        handle.terminal = false;
      }
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT, event);
      if (event && event.type === 'memory_store_changed') {
        broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.MEMORY_STORE_CHANGED, event);
      }
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.ROWS, {
        conversationRef: handle.conversationRef,
        rows: Array.isArray(snapshot.view?.displayRows) ? snapshot.view.displayRows : [],
      });
      if (typeof setLatestCurrentTurnProjection === 'function') {
        setLatestCurrentTurnProjection(snapshot.currentTurn || null);
      }
      if (typeof setLatestConversationView === 'function') {
        setLatestConversationView(snapshot.view || null);
      }
      const latestPendingTurn = typeof getLatestPendingTurn === 'function'
        ? getLatestPendingTurn()
        : null;
      if (
        latestPendingTurn
        && typeof pendingTurnMatchesCurrentTurn === 'function'
        && pendingTurnMatchesCurrentTurn(latestPendingTurn, snapshot.currentTurn)
        && typeof clearLatestPendingTurn === 'function'
      ) {
        clearLatestPendingTurn({
          conversationRef: latestPendingTurn.conversationRef,
          turnRef: latestPendingTurn.turnRef,
          broadcast: false,
        });
      }
      if (typeof logLiveSurfaceTrace === 'function') {
        logLiveSurfaceTrace('sdk.current_turn.received', {
          ...(typeof summarizeCurrentTurn === 'function'
            ? summarizeCurrentTurn(snapshot.currentTurn)
            : {}),
          source: 'conversation-runtime',
          displayRowCount: Array.isArray(snapshot.view?.displayRows) ? snapshot.view.displayRows.length : 0,
        });
      }
      if (
        typeof isDebugFlagEnabled === 'function'
        && isDebugFlagEnabled('streamEvents')
        && currentTurnTraceLogger
        && typeof currentTurnTraceLogger.trace === 'function'
      ) {
        currentTurnTraceLogger.trace(snapshot.currentTurn);
      }
      const syncSdkLiveTurnSurfaceIntent = typeof getSyncSdkLiveTurnSurfaceIntent === 'function'
        ? getSyncSdkLiveTurnSurfaceIntent()
        : null;
      if (typeof syncSdkLiveTurnSurfaceIntent === 'function') {
        try {
          syncSdkLiveTurnSurfaceIntent(snapshot || null);
        } catch (error) {
          if (typeof log === 'function') {
            log('Failed to sync SDK live-turn surface intent:', error?.message || error);
          }
        }
      }
      broadcastToRenderers(DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN, {
        conversationRef: handle.conversationRef,
        currentTurn: snapshot.currentTurn || null,
        view: snapshot.view || null,
        viewDiagnostics: snapshot.viewDiagnostics || null,
      });
      const terminalStatus = typeof buildConversationTerminalStatus === 'function'
        ? buildConversationTerminalStatus(event, workspacePath)
        : null;
      if (terminalStatus) {
        broadcastStatus(terminalStatus);
      }
    });
    runtimeHandles.set(runtimeConversationRef, handle);
    broadcastStatus({
      phase: 'ready',
      conversationRef: runtimeConversationRef,
      workspacePath,
    });
    return handle;
  }

  function getConversationRuntimeHandle(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef) || defaultConversationRef;
    return runtimeHandles.get(resolvedConversationRef) || createRuntimeHandle(resolvedConversationRef);
  }

  function closeRuntimeHandle(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef);
    if (!resolvedConversationRef) {
      return;
    }
    const handle = runtimeHandles.get(resolvedConversationRef);
    if (!handle) {
      return;
    }
    handle.detachRuntimeEvents();
    handle.runtime.close();
    runtimeHandles.delete(resolvedConversationRef);
  }

  function closeAllRuntimeHandles() {
    for (const handle of runtimeHandles.values()) {
      handle.detachRuntimeEvents();
      handle.runtime.close();
    }
    runtimeHandles.clear();
  }

  function markInferenceContextStale(nextConversationRef = null) {
    const resolvedConversationRef = normalizeOptionalString(nextConversationRef);
    const handles = resolvedConversationRef
      ? [runtimeHandles.get(resolvedConversationRef)].filter(Boolean)
      : Array.from(runtimeHandles.values());
    for (const handle of handles) {
      handle.inferenceContextReady = false;
      handle.inferenceContextPromise = null;
    }
  }

  async function reloadRuntimeSnapshot(handle) {
    const snapshot = await handle.runtime.load();
    handle.latestSnapshot = snapshot;
    return snapshot;
  }

  async function ensureInferenceContextForSend(handle, sendInput = {}) {
    if (handle.inferenceContextReady) {
      return;
    }
    if (handle.inferenceContextPromise) {
      await handle.inferenceContextPromise;
      return;
    }
    handle.inferenceContextPromise = (async () => {
      const resolvedWorkspacePath = (
        typeof resolveWorkspacePathForAgent === 'function'
          ? resolveWorkspacePathForAgent(sendInput?.payload || sendInput)
          : null
      ) || workspacePath || null;
      const snapshot = await handle.runtime.rehydrate({
        workspace_path: resolvedWorkspacePath,
      });
      handle.latestSnapshot = snapshot;
      handle.inferenceContextReady = true;
    })();
    try {
      await handle.inferenceContextPromise;
    } finally {
      handle.inferenceContextPromise = null;
    }
  }

  getConversationRuntimeHandle(defaultConversationRef);
  if (typeof agent.subscribeRawBackendEvents === 'function') {
    const detach = agent.subscribeRawBackendEvents((event) => {
      if (typeof handleAgentBackendEvent === 'function') {
        handleAgentBackendEvent(event);
      }
    });
    if (typeof detach === 'function') {
      detachBackendEventSubscription = detach;
    }
  }

  return {
    run: async (input = {}) => {
      const sendInput = typeof input === 'string' ? { text: input } : input;
      const resolvedConversationRef = resolveRuntimeConversationRef(sendInput) || defaultConversationRef;
      const handle = getConversationRuntimeHandle(resolvedConversationRef);
      if (handle.sendInFlight && !handle.terminal) {
        throw new Error(`Conversation already has an active turn: ${resolvedConversationRef}`);
      }
      handle.sendInFlight = true;
      handle.terminal = false;
      broadcastStatus({
        phase: 'running',
        conversationRef: resolvedConversationRef,
        turnRef: sendInput.turnRef ?? null,
        workspacePath,
      });
      try {
        await ensureInferenceContextForSend(handle, sendInput);
        const result = await handle.runtime.send(sendInput);
        handle.activeTurnRef = result.turnRef;
        broadcastStatus({
          phase: 'running',
          conversationRef: resolvedConversationRef,
          turnRef: result.turnRef,
          workspacePath,
        });
        return result;
      } catch (error) {
        handle.sendInFlight = false;
        handle.terminal = true;
        throw error;
      }
    },
    stop: async (input = {}) => {
      const stopConversationRef = resolveRuntimeConversationRef(input) || defaultConversationRef;
      const stopTurnRef = input && typeof input === 'object' && typeof input.turn_ref === 'string'
        ? input.turn_ref
        : null;
      const handle = getConversationRuntimeHandle(stopConversationRef);
      handle.sendInFlight = false;
      handle.terminal = true;
      return handle.runtime.stop(stopTurnRef || handle.activeTurnRef || null);
    },
    updateSettings: payload => agent.updateSettings(payload),
    requestModelList: () => agent.requestModelList(),
    rehydrateMessages: async (payload = {}) => {
      const handle = getConversationRuntimeHandle(resolveRuntimeConversationRef(payload));
      const result = await handle.runtime.rehydrateMessages(payload);
      handle.inferenceContextReady = true;
      return result;
    },
    compactHistory: async (payload = {}) => {
      const handle = getConversationRuntimeHandle(resolveRuntimeConversationRef(payload));
      await ensureInferenceContextForSend(handle, payload);
      return handle.runtime.compactHistory({
        force: payload.force,
        payload,
      });
    },
    listMemories: options => agent.listMemories(options),
    deleteMemory: options => agent.deleteMemory(options),
    clearMemories: options => agent.clearMemories(options),
    listConversations: options => agent.listConversations(options),
    searchConversations: options => agent.searchConversations(options),
    deleteConversation: async (options = {}) => {
      const deletedConversationRef = resolveSdkCommandConversationRef(options);
      await agent.deleteConversation(options);
      closeRuntimeHandle(deletedConversationRef);
    },
    clearConversations: async (options = {}) => {
      await agent.clearConversations(options);
      closeAllRuntimeHandles();
    },
    loadConversation: async (options = {}) => {
      const loadConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(loadConversationRef);
      return reloadRuntimeSnapshot(handle);
    },
    getConversationRevision: options => agent.getConversationRevision(options),
    listConversationRevisions: options => agent.listConversationRevisions(options),
    appendConversationEvent: async (options = {}) => {
      const event = options && typeof options === 'object' && 'event' in options
        ? options.event
        : options;
      const appendConversationRef = resolveSdkCommandConversationRef(event)
        || resolveSdkCommandConversationRef(options);
      await agent.appendConversationEvent(options);
      if (appendConversationRef) {
        const handle = getConversationRuntimeHandle(appendConversationRef);
        markInferenceContextStale(appendConversationRef);
        await reloadRuntimeSnapshot(handle);
      }
    },
    replaceCompactedReplay: async (options = {}) => {
      const snapshot = options && typeof options === 'object' && 'snapshot' in options
        ? options.snapshot
        : options;
      const replayConversationRef = resolveSdkCommandConversationRef(snapshot)
        || resolveSdkCommandConversationRef(options);
      await agent.replaceCompactedReplay(options);
      if (replayConversationRef) {
        const handle = getConversationRuntimeHandle(replayConversationRef);
        markInferenceContextStale(replayConversationRef);
        await reloadRuntimeSnapshot(handle);
      }
    },
    loadDisplayTimeline: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      return handle.runtime.loadDisplayTimeline({
        revisionId: normalizeOptionalString(options.revisionId),
      });
    },
    replaceRows: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      const checkpoint = await handle.runtime.replaceRows(input);
      markInferenceContextStale(handle.conversationRef);
      await reloadRuntimeSnapshot(handle);
      return checkpoint;
    },
    editAndResend: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      const result = await handle.runtime.editAndResend(input);
      markInferenceContextStale(handle.conversationRef);
      await reloadRuntimeSnapshot(handle);
      return result;
    },
    retryTurn: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      const result = await handle.runtime.retryTurn(input);
      markInferenceContextStale(handle.conversationRef);
      await reloadRuntimeSnapshot(handle);
      return result;
    },
    checkoutRevision: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      const result = await handle.runtime.checkoutRevision({
        revisionId: normalizeOptionalString(options.revisionId),
      });
      await reloadRuntimeSnapshot(handle);
      return result;
    },
    forkConversation: async (options = {}) => {
      const displayConversationRef = resolveSdkCommandConversationRef(options);
      const handle = getConversationRuntimeHandle(displayConversationRef);
      const input = { ...options };
      delete input.conversationRef;
      delete input.revisionId;
      delete input.revision_id;
      delete input.store;
      const result = await handle.runtime.fork(input);
      markInferenceContextStale(displayConversationRef);
      await reloadRuntimeSnapshot(handle);
      const forkedHandle = getConversationRuntimeHandle(result.conversationRef);
      const forkedSnapshot = await reloadRuntimeSnapshot(forkedHandle);
      return {
        ...result,
        view: forkedSnapshot?.view ?? result.view ?? null,
      };
    },
    wakewordDetected: payload => agent.wakewordDetected(payload),
    ensureConnected: () => agent.ensureConnected(),
    isConnected: () => agent.isConnected(),
    markInferenceContextsStale: () => markInferenceContextStale(),
    noteBackendTraffic: reason => agent.noteBackendTraffic(reason),
    syncBackendIdleTimer: reason => agent.syncBackendIdleTimer(reason),
    localStatus: () => agent.status(),
    localRuntime: agent.localRuntime || null,
    registerMcps: (mcps, options) => agent.registerMcps(mcps, options),
    refreshMcpServers: async ({ config = null } = {}) => {
      if (typeof refreshMcpServersForConfig !== 'function') {
        return null;
      }
      return refreshMcpServersForConfig({
        config,
        localRuntime: agent.localRuntime || null,
        clientInfo: typeof getMcpClientInfo === 'function' ? getMcpClientInfo() : null,
      });
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      detachBackendEventSubscription();
      closeAllRuntimeHandles();
      agent.sleep();
      broadcastStatus({
        phase: 'closed',
        conversationRef: defaultConversationRef,
        workspacePath,
      });
    },
  };
}

module.exports = {
  createDirectWakeUpAgentAdapter,
};
