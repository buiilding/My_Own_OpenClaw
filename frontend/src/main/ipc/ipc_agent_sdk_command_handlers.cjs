/**
 * Handles SDK-shaped agent commands for the Electron main process.
 */

const {
  SDK_RUNTIME_COMMANDS,
} = require('../../../../packages/windie-sdk-js/cjs/runtime/SdkRuntimeCommands.js');
const {
  createConversationMetadataDiagnosticsRuntime,
} = require('./ipc_conversation_metadata_diagnostics_runtime.cjs');

const conversationMetadataDiagnosticsRuntime = createConversationMetadataDiagnosticsRuntime();

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneJsonObject(value) {
  if (!isPlainObject(value)) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeMemoryType(value) {
  const type = normalizeOptionalString(value);
  if (type !== 'episodic' && type !== 'semantic') {
    throw new Error('Agent SDK command requires memory type episodic or semantic.');
  }
  return type;
}

function requireCommandUserId(payload = {}, currentUserId = null) {
  const userId = normalizeOptionalString(payload.userId);
  if (!userId || userId === 'default_user') {
    throw new Error('Agent SDK command requires an active user id.');
  }
  if (currentUserId && userId !== currentUserId) {
    throw new Error('Agent SDK command user id does not match the active user.');
  }
  return userId;
}

function requireAuthenticatedCommandUserId(currentUserId = null) {
  const userId = normalizeOptionalString(currentUserId);
  if (!userId || userId === 'default_user') {
    throw new Error('Agent SDK command requires an authenticated user.');
  }
  return userId;
}

function optionalCommandConversationRef(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'conversation_ref')) {
    throw new Error('Agent SDK command requires conversationRef; conversation_ref is not supported.');
  }
  return normalizeOptionalString(payload.conversationRef);
}

function optionalTransportConversationRef(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'conversationRef')) {
    throw new Error('Agent runtime transport command requires conversation_ref; conversationRef is not supported.');
  }
  return normalizeOptionalString(payload.conversation_ref);
}

function rejectRemovedTransportTurnRef(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'turnRef')) {
    throw new Error('Agent runtime transport command requires turn_ref; turnRef is not supported.');
  }
}

function requireCommandConversationRef(payload = {}) {
  const conversationRef = optionalCommandConversationRef(payload);
  if (!conversationRef) {
    throw new Error('Agent SDK command requires a conversation reference.');
  }
  return conversationRef;
}

function requireCommandString(payload = {}, key, label) {
  const value = normalizeOptionalString(payload[key]);
  if (!value) {
    throw new Error(`Agent SDK command requires ${label}.`);
  }
  return value;
}

function appendRendererAppDiagnostic(payload = {}, deps = {}) {
  const state = deps.getState();
  const context = conversationMetadataDiagnosticsRuntime.createContext(payload, state);
  return deps.appendAppDiagnostic({
    ...context,
    stage: normalizeOptionalString(payload.stage) || 'renderer',
    status: normalizeOptionalString(payload.status) || 'succeeded',
    runtime: normalizeOptionalString(payload.runtime) || 'renderer',
    durationMs: normalizePositiveInteger(payload.durationMs),
    data: isPlainObject(payload.data) ? payload.data : {},
    error: payload.error,
  });
}

function buildReplayRuntimePayload({
  conversationRef,
  text,
  payload,
  deps,
} = {}) {
  const basePayload = cloneJsonObject(payload) || {};
  const runtimePayload = {
    ...basePayload,
    conversation_ref: conversationRef,
  };
  if (typeof text === 'string' && text.trim()) {
    runtimePayload.text = text.trim();
  }
  if (typeof deps.attachRuntimeTurnContextToPayload !== 'function') {
    return runtimePayload;
  }
  return cloneJsonObject(deps.attachRuntimeTurnContextToPayload(runtimePayload)) || runtimePayload;
}

function traceReplayRuntimeSend({
  conversationRef,
  text,
  turnRef,
  payload,
  deps,
} = {}) {
  if (typeof deps.traceRuntimeSend !== 'function') {
    return;
  }
  deps.traceRuntimeSend({
    conversationRef,
    text: typeof text === 'string' ? text : '',
    turnRef,
    payload,
    resources: Array.isArray(payload?.resources) ? payload.resources : [],
  });
}

function buildAgentSdkCommandHandlers({
  event,
  handleRendererChatQuery,
  handleRendererStopQuery,
  deps,
}) {
  return {
    [SDK_RUNTIME_COMMANDS.CONVERSATION_SEND]: async (payload = {}) => handleRendererChatQuery(event, payload),
    [SDK_RUNTIME_COMMANDS.CONVERSATION_STOP]: async (payload = {}) => {
      optionalTransportConversationRef(payload);
      rejectRemovedTransportTurnRef(payload);
      return handleRendererStopQuery(payload);
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE]: async (payload = {}) => {
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.rehydrate',
        conversationRef: optionalTransportConversationRef(payload),
        workspacePath: deps.resolveWorkspacePathForAgent(payload),
      });
      return agent.rehydrateMessages(payload);
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT]: async (payload = {}) => {
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.compact',
        conversationRef: optionalTransportConversationRef(payload),
      });
      return agent.compactHistory(payload);
    },
    [SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE]: async (payload = {}) => deps.sendSettingsUpdate(
      payload,
      'agent-sdk-command',
    ),
    [SDK_RUNTIME_COMMANDS.MODELS_LIST]: async () => deps.requestModelListThroughAgentSdkRuntime(),
    [SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED]: async (payload = {}) => {
      if (!deps.isBackendRuntimeConnected()) {
        await deps.ensureBackendConnection('wakeword-detected');
      }
      await deps.ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = deps.getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
      return deps.sendWakewordDetectedThroughAgentSdkRuntime(payload);
    },
    [SDK_RUNTIME_COMMANDS.MEMORIES_LIST]: async (payload = {}) => {
      const agent = await deps.ensureAgent({ reason: 'sdk-command:memories.list' });
      requireAuthenticatedCommandUserId(deps.getState().currentUserId);
      return agent.listMemories({
        type: normalizeMemoryType(payload.type),
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    [SDK_RUNTIME_COMMANDS.MEMORIES_DELETE]: async (payload = {}) => {
      const agent = await deps.ensureAgent({ reason: 'sdk-command:memories.delete' });
      requireAuthenticatedCommandUserId(deps.getState().currentUserId);
      return agent.deleteMemory({
        type: normalizeMemoryType(payload.type),
        memoryId: requireCommandString(payload, 'memoryId', 'memory id'),
      });
    },
    [SDK_RUNTIME_COMMANDS.MEMORIES_CLEAR_ALL]: async () => {
      const agent = await deps.ensureAgent({ reason: 'sdk-command:memories.clearAll' });
      requireAuthenticatedCommandUserId(deps.getState().currentUserId);
      return agent.clearMemories();
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST]: async (payload = {}) => {
      const diagnostics = conversationMetadataDiagnosticsRuntime.createContext(payload, deps.getState());
      const startedAt = Date.now();
      const limit = normalizePositiveInteger(payload.limit);
      let failureStage = 'user_validated';
      conversationMetadataDiagnosticsRuntime.record(deps.appendAppDiagnostic, diagnostics, {
        stage: 'ipc_received',
        status: 'succeeded',
        runtime: 'electron-main',
        data: {
          hasUserId: Boolean(normalizeOptionalString(payload.userId)),
          limit,
          backendConnected: Boolean(deps.getState().isConnected),
        },
      });
      try {
        const userId = requireCommandUserId(payload, deps.getState().currentUserId);
        failureStage = 'agent_ready';
        conversationMetadataDiagnosticsRuntime.record(deps.appendAppDiagnostic, diagnostics, {
          stage: 'user_validated',
          status: 'succeeded',
          runtime: 'electron-main',
          data: {
            hasUserId: true,
            userIdMatchesActive: !deps.getState().currentUserId || userId === deps.getState().currentUserId,
          },
        });
        const agent = await deps.ensureAgent({ reason: 'sdk-command:conversations.list' });
        failureStage = 'sdk_list';
        conversationMetadataDiagnosticsRuntime.record(deps.appendAppDiagnostic, diagnostics, {
          stage: 'agent_ready',
          status: 'succeeded',
          runtime: 'electron-main',
          data: {
            backendConnected: Boolean(deps.getState().isConnected),
            localRuntimeReady: true,
          },
        });
        return agent.listConversations({
          limit,
          diagnostics: {
            ...diagnostics,
            emit: async eventInput => {
              conversationMetadataDiagnosticsRuntime.record(
                deps.appendAppDiagnostic,
                diagnostics,
                eventInput,
              );
            },
          },
        });
      } catch (error) {
        conversationMetadataDiagnosticsRuntime.record(deps.appendAppDiagnostic, diagnostics, {
          stage: failureStage,
          status: 'failed',
          runtime: 'electron-main',
          durationMs: Date.now() - startedAt,
          data: {
            hasUserId: Boolean(normalizeOptionalString(payload.userId)),
            backendConnected: Boolean(deps.getState().isConnected),
            localRuntimeReady: Boolean(deps.getState().agent),
          },
          error,
        });
        throw error;
      }
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({ reason: 'sdk-command:conversations.search' });
      return agent.searchConversations({
        query: typeof payload.query === 'string' ? payload.query : '',
        limit: normalizePositiveInteger(payload.limit),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({ reason: 'sdk-command:conversations.delete' });
      await agent.deleteConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return { deleted: true };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATIONS_CLEAR_ALL]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({ reason: 'sdk-command:conversations.clearAll' });
      await agent.clearConversations();
      return { deleted: true };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.load',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.loadDisplay',
        conversationRef: optionalCommandConversationRef(payload),
      });
      const snapshot = await agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return {
        display: snapshot.display,
        view: snapshot.view,
        currentTurn: snapshot.currentTurn,
      };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY_TIMELINE]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.loadDisplayTimeline',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.loadDisplayTimeline({
        conversationRef: requireCommandConversationRef(payload),
        revisionId: normalizeOptionalString(payload.revisionId),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_REHYDRATE]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.loadRehydrate',
        conversationRef: optionalCommandConversationRef(payload),
      });
      const snapshot = await agent.loadConversation({
        conversationRef: requireCommandConversationRef(payload),
      });
      return {
        rehydrate: snapshot.rehydrate,
      };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_GET_REVISION]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.getRevision',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.getConversationRevision({
        conversationRef: requireCommandConversationRef(payload),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_LIST_REVISIONS]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.listRevisions',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.listConversationRevisions({
        conversationRef: requireCommandConversationRef(payload),
        limit: Number.isFinite(payload.limit) ? payload.limit : undefined,
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_APPEND_EVENT]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationEvent = isPlainObject(payload.event) ? payload.event : null;
      if (!conversationEvent) {
        throw new Error('conversation.appendEvent requires an event payload');
      }
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.appendEvent',
        conversationRef: optionalCommandConversationRef(conversationEvent)
          || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.appendConversationEvent(conversationEvent);
      return { stored: true };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_REPLACE_ROWS]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.replaceRows',
        conversationRef,
      });
      return runtimeRegistry.replaceRows({
        conversationRef,
        baseRevisionId: requireCommandString(payload, 'baseRevisionId', 'base revision id'),
        reason: requireCommandString(payload, 'reason', 'display replacement reason'),
        rows: cloneJsonArray(payload.rows),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_EDIT_AND_RESEND]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const text = requireCommandString(payload, 'text', 'edited text');
      const turnRef = normalizeOptionalString(payload.turnRef) ?? undefined;
      const runtimePayload = buildReplayRuntimePayload({
        conversationRef,
        text,
        payload: payload.payload,
        deps,
      });
      traceReplayRuntimeSend({
        conversationRef,
        text,
        turnRef,
        payload: runtimePayload,
        deps,
      });
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.editAndResend',
        conversationRef,
      });
      return runtimeRegistry.editAndResend({
        conversationRef,
        messageId: requireCommandString(payload, 'messageId', 'message id'),
        text,
        turnRef,
        payload: runtimePayload,
        model: cloneJsonObject(payload.model),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_RETRY_TURN]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const turnRef = normalizeOptionalString(payload.turnRef) ?? undefined;
      const runtimePayload = buildReplayRuntimePayload({
        conversationRef,
        payload: payload.payload,
        deps,
      });
      traceReplayRuntimeSend({
        conversationRef,
        turnRef,
        payload: runtimePayload,
        deps,
      });
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.retryTurn',
        conversationRef,
      });
      return runtimeRegistry.retryTurn({
        conversationRef,
        messageId: normalizeOptionalString(payload.messageId) ?? undefined,
        turnRef,
        payload: runtimePayload,
        model: cloneJsonObject(payload.model),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_CHECKOUT_REVISION]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.checkoutRevision',
        conversationRef,
      });
      return runtimeRegistry.checkoutRevision({
        conversationRef,
        revisionId: requireCommandString(payload, 'revisionId', 'revision id'),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_FORK]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.fork',
        conversationRef,
      });
      const newConversationRef = normalizeOptionalString(payload.newConversationRef);
      return runtimeRegistry.forkConversation({
        conversationRef,
        sourceRevisionId: normalizeOptionalString(payload.sourceRevisionId) ?? undefined,
        cutAfterRowId: normalizeOptionalString(payload.cutAfterRowId) ?? undefined,
        ...(newConversationRef ? { newConversationRef } : {}),
      });
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_REPLACE_COMPACTED_REPLAY]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const snapshot = isPlainObject(payload.snapshot) ? payload.snapshot : null;
      if (!snapshot) {
        throw new Error('conversation.replaceCompactedReplay requires a snapshot payload');
      }
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.replaceCompactedReplay',
        conversationRef: optionalCommandConversationRef(snapshot) || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.replaceCompactedReplay(snapshot);
      return { stored: true };
    },
    [SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND]: async (payload = {}) => appendRendererAppDiagnostic(
      payload,
      deps,
    ),
  };
}

async function handleAgentSdkInvoke(event, input = {}, dependencies = {}) {
  const command = normalizeOptionalString(input?.command);
  const payload = isPlainObject(input?.payload) ? input.payload : {};
  const handlers = buildAgentSdkCommandHandlers({
    event,
    handleRendererChatQuery: dependencies.handleRendererChatQuery,
    handleRendererStopQuery: dependencies.handleRendererStopQuery,
    deps: dependencies.deps,
  });
  try {
    const handler = command ? handlers[command] : null;
    if (!handler) {
      throw new Error(`Unsupported agent SDK command: ${command || 'unknown'}`);
    }
    const data = await handler(payload);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || `Agent SDK command failed: ${command || 'unknown'}`,
    };
  }
}

function registerAgentSdkInvokeHandler({
  ipcMain,
  invokeChannel,
  handleRendererChatQuery,
  handleRendererStopQuery,
  deps,
  handleInvoke = handleAgentSdkInvoke,
}) {
  ipcMain.handle(invokeChannel, async (event, payload = {}) => (
    handleInvoke(event, payload, {
      handleRendererChatQuery,
      handleRendererStopQuery,
      deps,
    })
  ));
}

function createAgentSdkInvokeHandlerRuntime({
  invokeChannel,
  deps,
  handleInvoke = handleAgentSdkInvoke,
} = {}) {
  function register({
    ipcMain,
    handleRendererChatQuery,
    handleRendererStopQuery,
  } = {}) {
    return registerAgentSdkInvokeHandler({
      ipcMain,
      invokeChannel,
      handleRendererChatQuery,
      handleRendererStopQuery,
      deps,
      handleInvoke,
    });
  }

  return {
    register,
  };
}

module.exports = {
  createAgentSdkInvokeHandlerRuntime,
};
