const {
  DESKTOP_STARTUP_DIAGNOSTICS_PATH,
  FRONTEND_INTERACTION_DIAGNOSTICS_PATH,
  IPC_BRIDGE_DIAGNOSTICS_PATH,
  LOCAL_BACKEND_LIFECYCLE_DIAGNOSTICS_PATH,
  SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
  WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
  appendDiagnosticEvent,
} = require('./app_diagnostics_store.cjs');

function normalizeString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function diagnosticId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function finiteNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function compactData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== null && typeof value !== 'undefined'),
  );
}

function appendDiagnosticSafely(event, append = appendDiagnosticEvent) {
  try {
    return append(event);
  } catch (_error) {
    return { stored: false };
  }
}

function resolveAppend(options = {}) {
  return typeof options.appendDiagnosticEvent === 'function'
    ? options.appendDiagnosticEvent
    : appendDiagnosticEvent;
}

function appendAppRuntimeDiagnostic(input = {}, options = {}) {
  const append = resolveAppend(options);
  const path = normalizeString(input.path);
  const stage = normalizeString(input.stage || input.action) || 'unknown';
  return appendDiagnosticSafely({
    traceId: normalizeString(input.traceId) || diagnosticId('app-diagnostic'),
    spanId: normalizeString(input.spanId),
    parentSpanId: normalizeString(input.parentSpanId),
    path,
    stage,
    status: normalizeString(input.status) || 'succeeded',
    runtime: normalizeString(input.runtime) || 'electron-main',
    requestId: normalizeString(input.requestId),
    sessionId: normalizeString(input.sessionId),
    conversationRef: normalizeString(input.conversationRef || input.conversation_ref),
    durationMs: finiteNumberOrNull(input.durationMs),
    data: compactData(input.data || {}),
    error: input.error || null,
  }, append);
}

function appendDesktopStartupDiagnostic(input = {}, options = {}) {
  const data = compactData({
    action: normalizeString(input.action),
    startupLabel: normalizeString(input.label || input.startupLabel),
    pid: integerOrNull(input.pid),
    rssMb: finiteNumberOrNull(input.rssMb),
    heapUsedMb: finiteNumberOrNull(input.heapUsedMb),
    appProcessCount: integerOrNull(input.appProcessCount),
    browserProcessCount: integerOrNull(input.browserProcessCount),
    rendererProcessCount: integerOrNull(input.rendererProcessCount),
    gpuProcessCount: integerOrNull(input.gpuProcessCount),
    utilityProcessCount: integerOrNull(input.utilityProcessCount),
    appWorkingSetMb: finiteNumberOrNull(input.appWorkingSetMb),
    singleInstanceLockAcquired: booleanOrNull(input.singleInstanceLockAcquired),
    duplicateInstance: booleanOrNull(input.duplicateInstance),
    focus: booleanOrNull(input.focus),
    suppressed: booleanOrNull(input.suppressed),
    reason: normalizeString(input.reason),
    focusCooldownMs: finiteNumberOrNull(input.focusCooldownMs),
    vmMode: booleanOrNull(input.vmMode),
  });
  return appendAppRuntimeDiagnostic({
    ...input,
    path: DESKTOP_STARTUP_DIAGNOSTICS_PATH,
    stage: normalizeString(input.stage || input.action || input.label) || 'startup',
    runtime: 'electron-main',
    data,
  }, options);
}

function appendFrontendInteractionDiagnostic(entry = {}, options = {}) {
  const target = entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target)
    ? entry.target
    : {};
  return appendAppRuntimeDiagnostic({
    traceId: normalizeString(entry.traceId) || diagnosticId('frontend-interaction'),
    path: FRONTEND_INTERACTION_DIAGNOSTICS_PATH,
    stage: normalizeString(entry.action) || 'unknown',
    status: 'succeeded',
    runtime: 'renderer',
    conversationRef: normalizeString(entry.conversationRef || entry.conversation_ref),
    data: {
      action: normalizeString(entry.action) || 'unknown',
      event: normalizeString(entry.event) || 'unknown',
      view: normalizeString(entry.view) || 'unknown',
      targetTag: normalizeString(target.tagName),
      targetType: normalizeString(target.type),
      targetRole: normalizeString(target.role),
      hasTargetLabel: Boolean(normalizeString(target.label)),
      messageTextLength: finiteNumberOrNull(entry.messageTextLength),
      textLength: finiteNumberOrNull(entry.textLength),
      attachmentCount: finiteNumberOrNull(entry.attachmentCount),
      imageCount: finiteNumberOrNull(entry.imageCount),
      readableFileCount: finiteNumberOrNull(entry.readableFileCount),
      senderSurface: normalizeString(entry.senderSurface),
    },
  }, options);
}

function appendIpcBridgeDiagnostic(input = {}, options = {}) {
  return appendAppRuntimeDiagnostic({
    ...input,
    path: IPC_BRIDGE_DIAGNOSTICS_PATH,
    runtime: 'electron-main',
    data: {
      action: normalizeString(input.action),
      phase: normalizeString(input.phase),
      connected: booleanOrNull(input.connected),
      success: booleanOrNull(input.success),
      source: normalizeString(input.source),
      requestId: normalizeString(input.requestId),
      statusReason: normalizeString(input.statusReason),
      errorCode: normalizeString(input.errorCode),
      hasWorkspacePath: booleanOrNull(input.hasWorkspacePath),
      eventType: normalizeString(input.eventType),
      turnRef: normalizeString(input.turnRef),
      textLength: finiteNumberOrNull(input.textLength),
      resourceCount: finiteNumberOrNull(input.resourceCount),
      finalLength: finiteNumberOrNull(input.finalLength),
      contentLength: finiteNumberOrNull(input.contentLength),
      updatedKeys: normalizeString(input.updatedKeys),
      provider: normalizeString(input.provider),
      model: normalizeString(input.model),
      modelMode: normalizeString(input.modelMode),
      toolsMode: normalizeString(input.toolsMode),
      toolName: normalizeString(input.toolName),
      hasUserId: booleanOrNull(input.hasUserId),
      userIdSource: normalizeString(input.userIdSource),
      backendConnected: booleanOrNull(input.backendConnected),
      sidecarReady: booleanOrNull(input.sidecarReady),
      payloadHasEnabledKey: booleanOrNull(input.payloadHasEnabledKey),
      enabledServerCount: finiteNumberOrNull(input.enabledServerCount),
      previousEnabledServerCount: finiteNumberOrNull(input.previousEnabledServerCount),
      persistedEnabledServerCount: finiteNumberOrNull(input.persistedEnabledServerCount),
    },
  }, options);
}

function appendLocalBackendLifecycleDiagnostic(input = {}, options = {}) {
  return appendAppRuntimeDiagnostic({
    ...input,
    path: LOCAL_BACKEND_LIFECYCLE_DIAGNOSTICS_PATH,
    runtime: 'electron-main',
    data: {
      action: normalizeString(input.action),
      status: normalizeString(input.status),
      ready: booleanOrNull(input.ready),
      localBackendReady: booleanOrNull(input.localBackendReady),
      connected: booleanOrNull(input.connected),
      hasClient: booleanOrNull(input.hasClient),
      hasDiscoveryPath: booleanOrNull(input.hasDiscoveryPath),
      toolCount: finiteNumberOrNull(input.toolCount),
      responseKeyCount: finiteNumberOrNull(input.responseKeyCount),
    },
  }, options);
}

function appendSurfaceVisibilityDiagnostic(input = {}, options = {}) {
  const action = normalizeString(input.action) || 'unknown';
  const phase = normalizeString(input.phase);
  const conversationRef = normalizeString(input.conversationRef || input.conversation_ref);
  const turnRef = normalizeString(input.turnRef || input.turn_ref);
  return appendAppRuntimeDiagnostic({
    traceId: normalizeString(input.traceId) || diagnosticId('surface-visibility'),
    path: SURFACE_VISIBILITY_DIAGNOSTICS_PATH,
    stage: action,
    status: normalizeString(input.status) || 'succeeded',
    runtime: 'electron-main',
    conversationRef,
    data: {
      action,
      mode: normalizeString(input.mode),
      phase,
      source: normalizeString(input.source),
      reason: normalizeString(input.reason),
      userHidden: booleanOrNull(input.userHidden ?? input.user_hidden),
      focus: booleanOrNull(input.focus),
      restoreResponseOverlay: booleanOrNull(input.restoreResponseOverlay ?? input.restore_response_overlay),
      resultReason: normalizeString(input.resultReason || input.result_reason),
      chatWindowVisible: booleanOrNull(input.chatWindowVisible ?? input.chat_window_visible),
      responseWindowVisible: booleanOrNull(input.responseWindowVisible ?? input.response_window_visible),
      responseOverlayVisible: booleanOrNull(input.responseOverlayVisible ?? input.response_overlay_visible),
      responseOverlayVisibleFlag: booleanOrNull(input.responseOverlayVisibleFlag ?? input.response_overlay_visible_flag),
      requestedVisible: booleanOrNull(input.requestedVisible ?? input.requested_visible),
      responseLayoutMode: normalizeString(input.responseLayoutMode || input.response_layout_mode),
      width: finiteNumberOrNull(input.width),
      height: finiteNumberOrNull(input.height),
      activeGuardRef: normalizeString(input.activeGuardRef || input.active_guard_ref),
      staleGuardRef: normalizeString(input.staleGuardRef || input.stale_guard_ref),
      guardRef: normalizeString(input.guardRef || input.guard_ref),
      turnRef,
    },
  }, options);
}

function appendWakewordLifecycleDiagnostic(input = {}, options = {}) {
  return appendAppRuntimeDiagnostic({
    ...input,
    path: WAKEWORD_LIFECYCLE_DIAGNOSTICS_PATH,
    runtime: 'electron-main',
    data: {
      action: normalizeString(input.action),
      phase: normalizeString(input.phase),
      launchKind: normalizeString(input.launchKind),
      packaged: booleanOrNull(input.packaged),
      processPid: integerOrNull(input.processPid),
      exitCode: input.exitCode === null ? null : integerOrNull(input.exitCode),
      signal: normalizeString(input.signal),
      ready: booleanOrNull(input.ready),
      enabled: booleanOrNull(input.enabled),
      audioReady: booleanOrNull(input.audioReady),
      audioEnabled: booleanOrNull(input.audioEnabled),
      frameBytes: finiteNumberOrNull(input.frameBytes),
      maxFrameBytes: finiteNumberOrNull(input.maxFrameBytes),
      chunkCount: finiteNumberOrNull(input.chunkCount),
      modelId: normalizeString(input.modelId),
      confidence: finiteNumberOrNull(input.confidence),
      score: finiteNumberOrNull(input.score),
      errorCode: normalizeString(input.errorCode),
    },
    error: input.error,
  }, options);
}

module.exports = {
  appendAppRuntimeDiagnostic,
  appendDesktopStartupDiagnostic,
  appendFrontendInteractionDiagnostic,
  appendIpcBridgeDiagnostic,
  appendLocalBackendLifecycleDiagnostic,
  appendSurfaceVisibilityDiagnostic,
  appendWakewordLifecycleDiagnostic,
  compactData,
};
