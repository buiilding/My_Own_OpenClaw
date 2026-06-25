/**
 * Provides the ipc assistant trace module for the Electron main process.
 */

const {
  appendIpcBridgeDiagnostic: appendIpcBridgeDiagnosticRuntime,
} = require('../diagnostics/app_diagnostics_runtime.cjs');
const {
  isDebugFlagEnabled,
} = require('../app/debug_env.cjs');

const COMPACT_BACKEND_EVENT_TYPES = new Set([
  'query-accepted',
  'streaming-response',
  'assistant-message-full',
  'streaming-complete',
  'tool-call',
  'tool-bundle',
  'tool-output',
  'web-search-progress',
  'settings-updated',
  'error',
]);

const SAFE_SETTINGS_KEYS = [
  'model_mode',
  'model_provider',
  'selected_model_id',
  'interaction_mode',
  'speech_mode_enabled',
  'wakeword_enabled',
  'wakeword_stt_enabled',
  'browser_automation_enabled',
  'include_query_screenshot',
  'tools',
  'agent_definition',
];

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function safeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '-';
}

function summarizeBoolean(value) {
  return typeof value === 'boolean' ? String(value) : '-';
}

function payloadStringLength(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') {
      return value.length;
    }
  }
  return 0;
}

function uniqueCsv(values) {
  return [...new Set(values.filter(value => typeof value === 'string' && value.trim()))].join(',') || '-';
}

function summarizeAgentDefinitionTools(agentDefinitionInput) {
  const agentDefinition = safeObject(agentDefinitionInput);
  const tools = safeObject(agentDefinition.tools);
  const clientManifest = safeObject(tools.client_manifest);
  const clientTools = Array.isArray(clientManifest.tools) ? clientManifest.tools : [];
  const disabledTools = Array.isArray(tools.disabled_tools) ? tools.disabled_tools : [];
  const enabledRemoteTools = Array.isArray(tools.enabled_remote_tools) ? tools.enabled_remote_tools : [];
  const systemPrompt = safeObject(agentDefinition.system_prompt);
  return {
    hasAgentDefinition: Object.keys(agentDefinition).length > 0,
    agentDefinitionMode: typeof agentDefinition.mode === 'string' ? agentDefinition.mode : null,
    agentToolMode: typeof tools.mode === 'string' ? tools.mode : null,
    clientManifestToolCount: clientTools.length,
    disabledToolCount: disabledTools.length,
    enabledRemoteToolCount: enabledRemoteTools.length,
    systemPromptMode: typeof systemPrompt.mode === 'string' ? systemPrompt.mode : null,
  };
}

function summarizeModelSelection(modelInput) {
  const model = safeObject(modelInput);
  const modelProvider = safeId(model.modelProvider || model.model_provider);
  const modelId = safeId(model.modelId || model.model_id || model.id);
  return {
    hasModel: Object.keys(model).length > 0,
    modelProvider: modelProvider !== '-' ? modelProvider : null,
    modelId: modelId !== '-' ? modelId : null,
  };
}

function modelSelectionLabel(summary) {
  if (!summary?.hasModel) {
    return '-';
  }
  return `${safeId(summary.modelProvider)}/${safeId(summary.modelId)}`;
}

function summarizeRendererQueryModels(input = {}, sdkPayload = {}) {
  const rendererPayload = safeObject(input.rendererPayload);
  const preparedPayload = safeObject(input.preparedPayload);
  const renderer = summarizeModelSelection(rendererPayload.model);
  const prepared = summarizeModelSelection(preparedPayload.model);
  const sdk = summarizeModelSelection(sdkPayload.model);
  return {
    rendererPayloadHasModel: renderer.hasModel,
    rendererPayloadModelProvider: renderer.modelProvider,
    rendererPayloadModelId: renderer.modelId,
    preparedPayloadHasModel: prepared.hasModel,
    preparedPayloadModelProvider: prepared.modelProvider,
    preparedPayloadModelId: prepared.modelId,
    sdkPayloadHasModel: sdk.hasModel,
    sdkPayloadModelProvider: sdk.modelProvider,
    sdkPayloadModelId: sdk.modelId,
    modelDroppedBeforeSdk: Boolean((renderer.hasModel || prepared.hasModel) && !sdk.hasModel),
    rendererLabel: modelSelectionLabel(renderer),
    preparedLabel: modelSelectionLabel(prepared),
    sdkLabel: modelSelectionLabel(sdk),
  };
}

function eventPayload(data) {
  return safeObject(data?.payload);
}

function eventTurnRef(data) {
  const payload = eventPayload(data);
  return safeId(data?.turn_ref || payload.turn_ref);
}

function eventConversationRef(data) {
  const payload = eventPayload(data);
  return safeId(data?.conversation_ref || payload.conversation_ref);
}

function eventRequestId(data) {
  const payload = eventPayload(data);
  return safeId(
    data?.request_id
    || payload.request_id
    || payload.correlation_id
  );
}

function eventToolName(data) {
  const payload = eventPayload(data);
  return safeId(
    payload.tool_name
    || payload.name
    || payload.tool?.name,
  );
}

function compactBackendSummary(data) {
  const payload = eventPayload(data);
  return [
    `type=${safeString(data?.type) || 'unknown'}`,
    `turn=${eventTurnRef(data)}`,
    `conv=${eventConversationRef(data)}`,
    `request=${eventRequestId(data)}`,
    `tool=${eventToolName(data)}`,
    `text_len=${payloadStringLength(payload, ['text', 'delta', 'assistant_delta'])}`,
    `final_len=${payloadStringLength(payload, ['final_response'])}`,
    `content_len=${payloadStringLength(payload, ['content', 'message', 'output'])}`,
    `success=${summarizeBoolean(payload.success)}`,
  ].join(' ');
}

function currentTurnTraceKey(currentTurn) {
  const conversationRef = safeId(currentTurn?.conversationRef);
  const turnRef = safeId(currentTurn?.turnRef);
  return `${conversationRef}:${turnRef}`;
}

function currentTurnTraceSnapshot(currentTurn) {
  const toolEvents = Array.isArray(currentTurn?.toolEvents) ? currentTurn.toolEvents : [];
  return {
    conversationRef: safeId(currentTurn?.conversationRef),
    turnRef: safeId(currentTurn?.turnRef),
    phase: safeString(currentTurn?.phase) || 'unknown',
    assistantLength: safeString(currentTurn?.assistantText).length,
    reasoningLength: safeString(currentTurn?.reasoningText).length,
    toolCount: toolEvents.length,
    lastError: currentTurn?.lastError || null,
  };
}

function buildCurrentTurnTraceSummary(snapshot) {
  return [
    `phase=${snapshot.phase}`,
    `turn=${snapshot.turnRef}`,
    `conv=${snapshot.conversationRef}`,
    `assistant_len=${snapshot.assistantLength}`,
    `reasoning_len=${snapshot.reasoningLength}`,
    `tool_events=${snapshot.toolCount}`,
  ].join(' ');
}

function createCurrentTurnTraceLogger({ log, maxTrackedTurns = 64 } = {}) {
  const cursors = new Map();

  function remember(key, snapshot) {
    cursors.set(key, snapshot);
    if (cursors.size <= maxTrackedTurns) {
      return;
    }
    const [oldestKey] = cursors.keys();
    cursors.delete(oldestKey);
  }

  function trace(currentTurn) {
    if (!currentTurn || typeof currentTurn !== 'object' || typeof log !== 'function') {
      return [];
    }
    const key = currentTurnTraceKey(currentTurn);
    const previous = cursors.get(key) || null;
    const snapshot = currentTurnTraceSnapshot(currentTurn);
    const summary = buildCurrentTurnTraceSummary(snapshot);
    const emitted = [];

    function emit(message) {
      const fullMessage = `[AssistantTrace][sdk] ${message}`;
      log(fullMessage);
      emitted.push(fullMessage);
    }

    if (!previous) {
      emit(`turn projection opened ${summary}`);
    }

    if (
      snapshot.assistantLength > 0
      && (!previous || previous.assistantLength === 0)
    ) {
      emit(`assistant response started ${summary}`);
    } else if (
      previous
      && snapshot.assistantLength !== previous.assistantLength
    ) {
      const deltaLength = snapshot.assistantLength - previous.assistantLength;
      emit(`assistant text advanced delta_len=${deltaLength} ${summary}`);
    }

    if (previous && snapshot.phase !== previous.phase) {
      emit(`phase changed from=${previous.phase} to=${snapshot.phase} ${summary}`);
    }

    if (previous && snapshot.toolCount !== previous.toolCount) {
      emit(`tool event count changed from=${previous.toolCount} to=${snapshot.toolCount} ${summary}`);
    }

    if (snapshot.phase === 'complete' && (!previous || previous.phase !== 'complete')) {
      emit(`assistant complete ${summary}`);
    }

    if (
      snapshot.phase === 'error'
      && (!previous || previous.phase !== 'error' || previous.lastError !== snapshot.lastError)
    ) {
      emit(`assistant error last_error=${safeString(snapshot.lastError) || '-'} ${summary}`);
    }

    remember(key, snapshot);
    return emitted;
  }

  function reset() {
    cursors.clear();
  }

  return {
    reset,
    trace,
  };
}

function buildSettingsTraceSummary(config = {}, source = 'unknown', msgId = null) {
  const payload = safeObject(config);
  const keys = SAFE_SETTINGS_KEYS.filter(key => Object.prototype.hasOwnProperty.call(payload, key));
  const tools = safeObject(payload.tools);
  return [
    `source=${safeId(source)}`,
    `id=${safeId(msgId)}`,
    `keys=${uniqueCsv(keys)}`,
    `provider=${safeId(payload.model_provider)}`,
    `model=${safeId(payload.selected_model_id)}`,
    `mode=${safeId(payload.model_mode)}`,
    `tools_mode=${safeId(tools.mode)}`,
  ].join(' ');
}

function createElectronMainTraceLogger({
  log,
  maxTrackedTurns = 64,
  appendIpcBridgeDiagnostic = appendIpcBridgeDiagnosticRuntime,
  stdoutEnabled = isDebugFlagEnabled('ipcStdout'),
} = {}) {
  const seenBackendTurns = new Map();

  function emit(scope, action, fields = '') {
    if (!stdoutEnabled || typeof log !== 'function') {
      return null;
    }
    const suffix = typeof fields === 'string' && fields.trim() ? ` ${fields.trim()}` : '';
    const message = `[ElectronTrace] ${scope} ${action}${suffix}`;
    log(message);
    return message;
  }

  function record(input = {}) {
    if (typeof appendIpcBridgeDiagnostic !== 'function') {
      return null;
    }
    return appendIpcBridgeDiagnostic(input);
  }

  function rememberBackendTurn(key) {
    seenBackendTurns.set(key, true);
    if (seenBackendTurns.size <= maxTrackedTurns) {
      return;
    }
    const [oldestKey] = seenBackendTurns.keys();
    seenBackendTurns.delete(oldestKey);
  }

  function traceBackendConnection(input = {}) {
    const type = safeString(input.type) || 'unknown';
    if (type === 'open') {
      record({
        action: 'connection.open',
        phase: 'backend',
        connected: true,
        hasUserId: Boolean(input.handshake?.user_id || input.userId || input.user_id),
        userIdSource: input.handshake?.user_id ? 'handshake' : 'event',
      });
      return emit('backend', 'connection.open', [
        `connected=true`,
        `user=${safeId(input.handshake?.user_id || input.userId || input.user_id)}`,
      ].join(' '));
    }
    if (type === 'close') {
      record({
        action: 'connection.close',
        phase: 'backend',
        connected: false,
        statusReason: input.closeReason || input.reason,
      });
      return emit('backend', 'connection.close', [
        `connected=false`,
        `reason=${safeId(input.closeReason || input.reason)}`,
        `reconnect=${summarizeBoolean(input.shouldReconnect)}`,
      ].join(' '));
    }
    if (type === 'error' || type === 'handshake-error' || type === 'message-error') {
      record({
        action: `connection.${type}`,
        phase: 'backend',
        status: 'failed',
        connected: false,
        error: input.error,
      });
      return emit('backend', `connection.${type}`, `error=${safeId(input.error?.message || input.error)}`);
    }
    return null;
  }

  function traceRendererQuery(input = {}) {
    const payload = safeObject(input.payload);
    const agentSummary = summarizeAgentDefinitionTools(payload.agent_definition);
    const modelSummary = summarizeRendererQueryModels(input, payload);
    const turnRef = safeId(input.queryMessageId);
    const conversationRef = safeId(input.conversationRef);
    record({
      action: 'query.send',
      phase: 'renderer',
      requestId: turnRef !== '-' ? turnRef : null,
      conversationRef: conversationRef !== '-' ? conversationRef : null,
      turnRef: turnRef !== '-' ? turnRef : null,
      textLength: typeof payload.text === 'string' ? payload.text.length : 0,
      resourceCount: Array.isArray(payload.resources) ? payload.resources.length : 0,
      ...agentSummary,
      rendererPayloadHasModel: modelSummary.rendererPayloadHasModel,
      rendererPayloadModelProvider: modelSummary.rendererPayloadModelProvider,
      rendererPayloadModelId: modelSummary.rendererPayloadModelId,
      preparedPayloadHasModel: modelSummary.preparedPayloadHasModel,
      preparedPayloadModelProvider: modelSummary.preparedPayloadModelProvider,
      preparedPayloadModelId: modelSummary.preparedPayloadModelId,
      sdkPayloadHasModel: modelSummary.sdkPayloadHasModel,
      sdkPayloadModelProvider: modelSummary.sdkPayloadModelProvider,
      sdkPayloadModelId: modelSummary.sdkPayloadModelId,
      modelDroppedBeforeSdk: modelSummary.modelDroppedBeforeSdk,
    });
    return emit('renderer', 'query.send', [
      `turn=${turnRef}`,
      `conv=${conversationRef}`,
      `text_len=${typeof payload.text === 'string' ? payload.text.length : 0}`,
      `resources=${Array.isArray(payload.resources) ? payload.resources.length : 0}`,
      `agent=${agentSummary.hasAgentDefinition ? 'true' : 'false'}`,
      `client_tools=${agentSummary.clientManifestToolCount}`,
      `disabled_tools=${agentSummary.disabledToolCount}`,
      `renderer_model=${modelSummary.rendererLabel}`,
      `prepared_model=${modelSummary.preparedLabel}`,
      `sdk_model=${modelSummary.sdkLabel}`,
      `model_dropped=${modelSummary.modelDroppedBeforeSdk}`,
    ].join(' '));
  }

  function traceRuntimeSend(input = {}) {
    const payload = safeObject(input.payload);
    const agentSummary = summarizeAgentDefinitionTools(payload.agent_definition);
    const turnRef = safeId(input.turnRef);
    const conversationRef = safeId(input.conversationRef || payload.conversation_ref);
    record({
      action: 'runtime.send',
      phase: 'sdk',
      conversationRef: conversationRef !== '-' ? conversationRef : null,
      turnRef: turnRef !== '-' ? turnRef : null,
      textLength: typeof input.text === 'string' ? input.text.length : 0,
      resourceCount: Array.isArray(input.resources) ? input.resources.length : 0,
      ...agentSummary,
    });
    return emit('sdk', 'runtime.send', [
      `turn=${turnRef}`,
      `conv=${conversationRef}`,
      `text_len=${typeof input.text === 'string' ? input.text.length : 0}`,
      `resources=${Array.isArray(input.resources) ? input.resources.length : 0}`,
      `agent=${agentSummary.hasAgentDefinition ? 'true' : 'false'}`,
      `client_tools=${agentSummary.clientManifestToolCount}`,
      `disabled_tools=${agentSummary.disabledToolCount}`,
      `remote_tools=${agentSummary.enabledRemoteToolCount}`,
    ].join(' '));
  }

  function traceSettingsUpdate(config = {}, source = 'unknown', msgId = null) {
    const payload = safeObject(config);
    const keys = SAFE_SETTINGS_KEYS.filter(key => Object.prototype.hasOwnProperty.call(payload, key));
    const tools = safeObject(payload.tools);
    record({
      action: 'settings.update.send',
      phase: 'settings',
      requestId: msgId,
      source,
      updatedKeys: uniqueCsv(keys),
      provider: payload.model_provider,
      model: payload.selected_model_id,
      modelMode: payload.model_mode,
      toolsMode: tools.mode,
    });
    return emit('settings', 'update.send', buildSettingsTraceSummary(config, source, msgId));
  }

  function traceBackendEvent(data) {
    if (!data || typeof data !== 'object' || !COMPACT_BACKEND_EVENT_TYPES.has(data.type)) {
      return [];
    }
    const emitted = [];
    const turnRef = eventTurnRef(data);
    const conversationRef = eventConversationRef(data);
    const payload = eventPayload(data);
    const turnKey = `${conversationRef}:${turnRef}`;
    if (turnRef !== '-' && !seenBackendTurns.has(turnKey)) {
      record({
        action: 'first_event',
        phase: 'backend',
        eventType: data.type,
        requestId: eventRequestId(data) !== '-' ? eventRequestId(data) : null,
        conversationRef: conversationRef !== '-' ? conversationRef : null,
        turnRef: turnRef !== '-' ? turnRef : null,
        toolName: eventToolName(data) !== '-' ? eventToolName(data) : null,
        textLength: payloadStringLength(payload, ['text', 'delta', 'assistant_delta']),
        finalLength: payloadStringLength(payload, ['final_response']),
        contentLength: payloadStringLength(payload, ['content', 'message', 'output']),
        success: typeof payload.success === 'boolean' ? payload.success : undefined,
      });
      const message = emit('backend', 'first_event', compactBackendSummary(data));
      if (message) {
        emitted.push(message);
      }
      rememberBackendTurn(turnKey);
    }
    if (data.type === 'tool-call' || data.type === 'tool-bundle' || data.type === 'web-search-progress') {
      record({
        action: 'tool_call',
        phase: 'backend',
        eventType: data.type,
        requestId: eventRequestId(data) !== '-' ? eventRequestId(data) : null,
        conversationRef: conversationRef !== '-' ? conversationRef : null,
        turnRef: turnRef !== '-' ? turnRef : null,
        toolName: eventToolName(data) !== '-' ? eventToolName(data) : null,
      });
      const message = emit('backend', 'tool_call', compactBackendSummary(data));
      if (message) {
        emitted.push(message);
      }
    } else if (data.type === 'tool-output') {
      record({
        action: 'tool_output',
        phase: 'backend',
        eventType: data.type,
        requestId: eventRequestId(data) !== '-' ? eventRequestId(data) : null,
        conversationRef: conversationRef !== '-' ? conversationRef : null,
        turnRef: turnRef !== '-' ? turnRef : null,
        contentLength: payloadStringLength(payload, ['content', 'message', 'output']),
        success: typeof payload.success === 'boolean' ? payload.success : undefined,
      });
      const message = emit('backend', 'tool_output', compactBackendSummary(data));
      if (message) {
        emitted.push(message);
      }
    } else if (data.type === 'streaming-complete') {
      record({
        action: 'complete',
        phase: 'backend',
        eventType: data.type,
        requestId: eventRequestId(data) !== '-' ? eventRequestId(data) : null,
        conversationRef: conversationRef !== '-' ? conversationRef : null,
        turnRef: turnRef !== '-' ? turnRef : null,
        finalLength: payloadStringLength(payload, ['final_response']),
      });
      const message = emit('backend', 'complete', compactBackendSummary(data));
      if (message) {
        emitted.push(message);
      }
    } else if (data.type === 'settings-updated') {
      record({
        action: 'settings.update.ack',
        phase: 'settings',
        requestId: data.id || data.payload?.id,
        success: true,
      });
      const message = emit('settings', 'update.ack', [
        `id=${safeId(data.id || data.payload?.id)}`,
        `success=true`,
      ].join(' '));
      if (message) {
        emitted.push(message);
      }
    } else if (data.type === 'error') {
      record({
        action: 'error',
        phase: 'backend',
        status: 'failed',
        eventType: data.type,
        requestId: eventRequestId(data) !== '-' ? eventRequestId(data) : null,
        conversationRef: conversationRef !== '-' ? conversationRef : null,
        turnRef: turnRef !== '-' ? turnRef : null,
        error: payload.error || payload.message || data.error,
      });
      const message = emit('backend', 'error', compactBackendSummary(data));
      if (message) {
        emitted.push(message);
      }
    }
    return emitted;
  }

  function reset() {
    seenBackendTurns.clear();
  }

  return {
    reset,
    traceBackendConnection,
    traceBackendEvent,
    traceRendererQuery,
    traceRuntimeSend,
    traceSettingsUpdate,
  };
}

module.exports = {
  createElectronMainTraceLogger,
  createCurrentTurnTraceLogger,
};
