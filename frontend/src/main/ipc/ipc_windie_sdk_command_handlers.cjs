/**
 * Handles SDK-shaped windie:invoke commands for the Electron main process.
 */

const {
  SDK_RUNTIME_COMMANDS,
} = require('../../../../packages/windie-sdk-js/cjs/index.js');
const {
  APP_DIAGNOSTICS_PATH,
} = require('../diagnostics/app_diagnostics_store.cjs');

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonObject(value) {
  if (!isPlainObject(value)) {
    return {};
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
  const userId = normalizeOptionalString(payload.userId || payload.user_id);
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
  return normalizeOptionalString(payload.conversationRef || payload.conversation_ref);
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

function normalizeAppDiagnosticContext(payload = {}, state = {}) {
  const diagnostics = isPlainObject(payload._diagnostics) ? payload._diagnostics : {};
  return {
    path: normalizeOptionalString(diagnostics.path) || APP_DIAGNOSTICS_PATH,
    traceId: normalizeOptionalString(diagnostics.traceId) || undefined,
    parentSpanId: normalizeOptionalString(diagnostics.parentSpanId) || null,
    requestId: normalizeOptionalString(diagnostics.requestId) || undefined,
    sessionId: normalizeOptionalString(diagnostics.sessionId) || state.currentSessionId || undefined,
    conversationRef: normalizeOptionalString(diagnostics.conversationRef)
      || state.currentConversationRef
      || undefined,
  };
}

function recordConversationMetadataListDiagnostic(appendAppDiagnostic, context = {}, input = {}) {
  const event = {
    path: context.path || APP_DIAGNOSTICS_PATH,
    traceId: context.traceId,
    parentSpanId: input.parentSpanId || context.parentSpanId || null,
    requestId: input.requestId || context.requestId,
    sessionId: input.sessionId || context.sessionId,
    conversationRef: input.conversationRef || context.conversationRef,
    ...input,
    data: {
      ...(input.data || {}),
      ...(input.requestId || context.requestId ? { requestId: input.requestId || context.requestId } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    },
  };
  const result = appendAppDiagnostic(event);
  if (result?.traceId && !context.traceId) {
    context.traceId = result.traceId;
  }
  return result;
}

function appendRendererAppDiagnostic(payload = {}, deps = {}) {
  const state = deps.getState();
  const context = normalizeAppDiagnosticContext(payload, state);
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

function buildAgentSdkCommandHandlers({
  event,
  handleRendererChatQuery,
  handleRendererStopQuery,
  deps,
}) {
  return {
    [SDK_RUNTIME_COMMANDS.CONVERSATION_SEND]: async (payload = {}) => handleRendererChatQuery(event, payload),
    [SDK_RUNTIME_COMMANDS.CONVERSATION_STOP]: async (payload = {}) => handleRendererStopQuery(payload),
    [SDK_RUNTIME_COMMANDS.CONVERSATION_REHYDRATE]: async (payload = {}) => {
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.rehydrate',
        conversationRef: optionalCommandConversationRef(payload),
        workspacePath: deps.resolveWorkspacePathForAgent(payload),
      });
      return agent.rehydrateMessages(payload);
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_COMPACT]: async (payload = {}) => {
      const agent = await deps.ensureAgent({
        reason: 'sdk-command:conversation.compact',
        conversationRef: optionalCommandConversationRef(payload),
      });
      return agent.compactHistory(payload);
    },
    [SDK_RUNTIME_COMMANDS.SETTINGS_UPDATE]: async (payload = {}) => deps.sendSettingsUpdate(
      payload,
      'renderer-sdk-command',
    ),
    [SDK_RUNTIME_COMMANDS.MODELS_LIST]: async () => deps.requestModelListThroughSdkAgent(),
    [SDK_RUNTIME_COMMANDS.WAKEWORD_DETECTED]: async (payload = {}) => {
      if (!deps.isBackendRuntimeConnected()) {
        await deps.ensureBackendConnection('wakeword-detected');
      }
      await deps.ensureInitialSettingsSync();
      const pendingSettingsSyncPromise = deps.getPendingSettingsSyncPromise();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
      return deps.sendWakewordDetectedThroughSdkAgent(payload);
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
      const diagnostics = normalizeAppDiagnosticContext(payload, deps.getState());
      const startedAt = Date.now();
      const limit = normalizePositiveInteger(payload.limit);
      let failureStage = 'user_validated';
      recordConversationMetadataListDiagnostic(deps.appendAppDiagnostic, diagnostics, {
        stage: 'ipc_received',
        status: 'succeeded',
        runtime: 'electron-main',
        data: {
          hasUserId: Boolean(normalizeOptionalString(payload.userId || payload.user_id)),
          limit,
          backendConnected: Boolean(deps.getState().isConnected),
        },
      });
      try {
        const userId = requireCommandUserId(payload, deps.getState().currentUserId);
        failureStage = 'agent_ready';
        recordConversationMetadataListDiagnostic(deps.appendAppDiagnostic, diagnostics, {
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
        recordConversationMetadataListDiagnostic(deps.appendAppDiagnostic, diagnostics, {
          stage: 'agent_ready',
          status: 'succeeded',
          runtime: 'electron-main',
          data: {
            backendConnected: Boolean(deps.getState().isConnected),
            sidecarReady: true,
          },
        });
        return agent.listConversations({
          limit,
          diagnostics: {
            ...diagnostics,
            emit: async eventInput => {
              recordConversationMetadataListDiagnostic(
                deps.appendAppDiagnostic,
                diagnostics,
                eventInput,
              );
            },
          },
        });
      } catch (error) {
        recordConversationMetadataListDiagnostic(deps.appendAppDiagnostic, diagnostics, {
          stage: failureStage,
          status: 'failed',
          runtime: 'electron-main',
          durationMs: Date.now() - startedAt,
          data: {
            hasUserId: Boolean(normalizeOptionalString(payload.userId || payload.user_id)),
            backendConnected: Boolean(deps.getState().isConnected),
            sidecarReady: Boolean(deps.getState().agent),
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
        displayRows: snapshot.displayRows,
        currentTurn: snapshot.currentTurn,
      };
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
    [SDK_RUNTIME_COMMANDS.CONVERSATION_REWRITE]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const plan = isPlainObject(payload.plan) ? payload.plan : null;
      if (!plan) {
        throw new Error('conversation.rewrite requires a plan payload');
      }
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.rewrite',
        conversationRef: optionalCommandConversationRef(plan) || optionalCommandConversationRef(payload),
      });
      await runtimeRegistry.rewriteConversation(plan);
      return { rewritten: true };
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
    [SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_EDIT_AND_RESEND]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const workspacePath = deps.resolveWorkspacePathForAgent(payload) || null;
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.prepareEditAndResend',
        conversationRef,
        workspacePath,
      });
      const prepared = await runtimeRegistry.prepareEditAndResend({
        conversationRef,
        messageId: requireCommandString(payload, 'messageId', 'message id'),
        text: requireCommandString(payload, 'text', 'replacement text'),
        turnRef: normalizeOptionalString(payload.turnRef || payload.turn_ref) || undefined,
        payload: cloneJsonObject(payload.payload),
        model: isPlainObject(payload.model) ? payload.model : undefined,
      });
      return {
        ...prepared,
        conversationRef,
        workspacePath,
      };
    },
    [SDK_RUNTIME_COMMANDS.CONVERSATION_PREPARE_RETRY_TURN]: async (payload = {}) => {
      requireCommandUserId(payload, deps.getState().currentUserId);
      const conversationRef = requireCommandConversationRef(payload);
      const workspacePath = deps.resolveWorkspacePathForAgent(payload) || null;
      const runtimeRegistry = await deps.ensureAgent({
        reason: 'sdk-command:conversation.prepareRetryTurn',
        conversationRef,
        workspacePath,
      });
      const messageId = normalizeOptionalString(payload.messageId || payload.message_id);
      const prepared = await runtimeRegistry.prepareRetryTurn({
        conversationRef,
        ...(messageId ? { messageId } : {}),
        turnRef: normalizeOptionalString(payload.turnRef || payload.turn_ref) || undefined,
        payload: cloneJsonObject(payload.payload),
        model: isPlainObject(payload.model) ? payload.model : undefined,
      });
      return {
        ...prepared,
        conversationRef,
        workspacePath,
      };
    },
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

module.exports = {
  handleAgentSdkInvoke,
};
