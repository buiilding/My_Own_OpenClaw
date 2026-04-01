const {
  ipcMain,
  shell,
  BrowserWindow,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { getSystemState, searchMemory, storeMemory } = require('./local_backend_bridge.cjs');
const {
  resolveBackendEndpointCandidates,
  resolveBackendEndpoints,
} = require('./backend_endpoints.cjs');
const {
  loadFrontendConfigFromDisk,
  saveFrontendConfigToDisk,
} = require('./ipc/ipc_frontend_config.cjs');
const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('./ipc/ipc_settings_sync.cjs');
const { persistMemoryStoreEvent } = require('./ipc/ipc_memory_store_persistence.cjs');
const { buildQueryPayloadContent } = require('./query_payload_builder.cjs');
const {
  resolveConversationRef: resolveConversationRefFromPayload,
  buildLocalUserMessage,
  buildQuerySendFailure,
} = require('./ipc/ipc_query_events.cjs');
const {
  generateUserId,
  normalizeBackendPayload,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc/ipc_runtime_helpers.cjs');
const {
  buildQueryPayload,
  prepareAutomatedQueryPayload,
  prepareRendererQueryPayload,
} = require('./ipc/ipc_query_runtime.cjs');
const {
  trackRendererWindow: trackRendererWindowRuntime,
  broadcastToRenderers: broadcastToRenderersRuntime,
} = require('./ipc/ipc_renderer_windows.cjs');
const {
  broadcastLocalUserMessage: broadcastLocalUserMessageRuntime,
  broadcastQuerySendFailure: broadcastQuerySendFailureRuntime,
} = require('./ipc/ipc_query_broadcast.cjs');
const {
  createResponseOverlayPhaseState,
} = require('./ipc/ipc_overlay_phase_state.cjs');
const {
  createIpcEventReplayState,
} = require('./ipc/ipc_event_replay_state.cjs');
const {
  loginOpenAICodexOAuth,
  logoutOpenAICodexOAuth,
} = require('./openai_codex_oauth.cjs');
const {
  registerClipboardImageHandler,
} = require('./ipc/ipc_clipboard_image.cjs');
const {
  resolveActiveSurfaceDisplayAffinity,
  setActiveDisplayAffinity,
} = require('./display_affinity_runtime.cjs');
const {
  applyTranscriptSessionSync,
} = require('./ipc/ipc_transcript_session_sync.cjs');
const {
  isAgentLoopStopShortcutPhase,
} = require('./agent_stop_shortcut_runtime.cjs');
const { logChatPillMainTrace } = require('./chat_pill_trace_runtime.cjs');

let BACKEND_ENDPOINTS = resolveBackendEndpoints();
let BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
let BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
let BACKEND_ENDPOINT_CANDIDATES = [BACKEND_ENDPOINTS];
let activeBackendEndpointIndex = 0;
const SETTINGS_SYNC_TIMEOUT_MS = 2500;
let ws = null;
let rendererWindows = new Set();
let isConnected = false;
let reconnectInterval = 5000;
let isFirstQuery = true;
let currentUserId = null;
let currentSessionId = null;
let currentServerUserId = null;
let currentConversationRef = null;
let latestFrontendConfig = null;
let hasAttemptedInitialSettingsSync = false;
let pendingSettingsSyncPromise = null;
const pendingSettingsSyncs = new Map();
const backendMessageObservers = new Set();
let applyResponseOverlayPhase = null;
let onBeforeOverlayQueryCapture = null;
let setAgentLoopStopShortcutEnabled = null;
let setGlobalAgentStopShortcutAccelerator = null;
let currentGlobalAgentStopShortcutStatus = null;
const responseOverlayPhaseState = createResponseOverlayPhaseState();
const ipcEventReplayState = createIpcEventReplayState();

function resolveFrontendOperatingSystem(platformName = process.platform) {
  switch (platformName) {
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return typeof platformName === 'string' && platformName.trim().length > 0
        ? platformName.trim()
        : null;
  }
}

function normalizeGlobalAgentStopShortcutStatus(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    return null;
  }

  const normalizeAccelerator = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  };

  const supportedAccelerators = Array.isArray(status.supportedAccelerators)
    ? status.supportedAccelerators
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
    : [];

  return {
    enabled: status.enabled === true,
    requestedAccelerator: normalizeAccelerator(status.requestedAccelerator),
    resolvedAccelerator: normalizeAccelerator(status.resolvedAccelerator),
    registeredAccelerator: normalizeAccelerator(status.registeredAccelerator),
    registrationFailed: status.registrationFailed === true,
    usingFallback: status.usingFallback === true,
    supportedAccelerators,
  };
}

function applyShortcutStatusFallbackToConfig(config) {
  if (!isValidConfigPayload(config)) {
    return config;
  }
  const resolvedAccelerator = currentGlobalAgentStopShortcutStatus?.resolvedAccelerator;
  if (
    currentGlobalAgentStopShortcutStatus?.registrationFailed === true
    || typeof resolvedAccelerator !== 'string'
    || !resolvedAccelerator
    || config.global_agent_stop_shortcut === resolvedAccelerator
  ) {
    return config;
  }
  return {
    ...config,
    global_agent_stop_shortcut: resolvedAccelerator,
  };
}

function refreshBackendEndpoints(options = {}) {
  BACKEND_ENDPOINT_CANDIDATES = resolveBackendEndpointCandidates(process.env, options);
  activeBackendEndpointIndex = 0;
  BACKEND_ENDPOINTS = BACKEND_ENDPOINT_CANDIDATES[0] || resolveBackendEndpoints(process.env, options);
  BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
  BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
}

function setActiveBackendEndpoint(index) {
  const candidate = BACKEND_ENDPOINT_CANDIDATES[index];
  if (!candidate) {
    return false;
  }
  activeBackendEndpointIndex = index;
  BACKEND_ENDPOINTS = candidate;
  BACKEND_URL = candidate.wsUrl;
  BACKEND_HTTP_URL = candidate.httpUrl;
  return true;
}

function advanceToNextBackendEndpoint() {
  return setActiveBackendEndpoint(activeBackendEndpointIndex + 1);
}

function log(message) {
  // Only log in development - production logging adds overhead
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[IPC Bridge] ${message}`);
  }
}

function notifyBackendMessageObservers(data) {
  if (!data || typeof data !== 'object') {
    return;
  }
  for (const observer of backendMessageObservers) {
    try {
      observer(data);
    } catch (error) {
      log(`Backend message observer error: ${error}`);
    }
  }
}

async function loadCachedFrontendConfigFromDisk() {
  return loadFrontendConfigFromDisk(log);
}

async function persistFrontendConfigToDisk(config) {
  const result = await saveFrontendConfigToDisk(config, log);
  if (result?.success && config && typeof config === 'object' && !Array.isArray(config)) {
    latestFrontendConfig = { ...config };
  }
  return result;
}

function updateGlobalAgentStopShortcutStatus(status) {
  currentGlobalAgentStopShortcutStatus = normalizeGlobalAgentStopShortcutStatus(status);

  if (isValidConfigPayload(latestFrontendConfig)) {
    const nextConfig = applyShortcutStatusFallbackToConfig(latestFrontendConfig);
    if (nextConfig !== latestFrontendConfig) {
      void persistFrontendConfigToDisk(nextConfig);
    }
  }

  broadcastConnectionStatus(isConnected);
}

function resetSettingsSyncState() {
  hasAttemptedInitialSettingsSync = false;
  pendingSettingsSyncPromise = null;
  clearPendingSettingsSyncs(pendingSettingsSyncs);
}

function resetBackendSessionState() {
  currentSessionId = null;
  currentServerUserId = null;
  currentConversationRef = null;
}

function buildIpcStatusPayload(connected) {
  return {
    isConnected: connected,
    userId: currentUserId,
    backendWsUrl: BACKEND_URL,
    backendHttpUrl: BACKEND_HTTP_URL,
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

function buildBackendSettingsPayload(config) {
  if (!isValidConfigPayload(config)) {
    return null;
  }
  const backendConfig = { ...config };
  delete backendConfig.global_agent_stop_shortcut;
  return backendConfig;
}

function broadcastConnectionStatus(connected) {
  broadcastToRenderers('ipc-status', buildIpcStatusPayload(connected));
}

function sendSettingsUpdate(config, source = 'renderer') {
  const backendConfig = buildBackendSettingsPayload(config);
  if (!backendConfig) {
    return Promise.resolve(false);
  }
  latestFrontendConfig = { ...config };
  const msgId = sendMessageToBackend('update-settings', backendConfig);
  if (!msgId) {
    return Promise.resolve(false);
  }
  const ackPromise = waitForSettingsAck(
    pendingSettingsSyncs,
    msgId,
    source,
    log,
    SETTINGS_SYNC_TIMEOUT_MS,
  );
  pendingSettingsSyncPromise = ackPromise.finally(() => {
    if (pendingSettingsSyncPromise === ackPromise) {
      pendingSettingsSyncPromise = null;
    }
  });
  return pendingSettingsSyncPromise;
}

async function ensureInitialSettingsSync() {
  if (!isConnected) {
    return;
  }

  if (hasAttemptedInitialSettingsSync) {
    if (pendingSettingsSyncPromise) {
      await pendingSettingsSyncPromise;
    }
    return;
  }

  hasAttemptedInitialSettingsSync = true;

  if (pendingSettingsSyncPromise) {
    await pendingSettingsSyncPromise;
    return;
  }

  if (!isValidConfigPayload(latestFrontendConfig)) {
    latestFrontendConfig = await loadCachedFrontendConfigFromDisk();
  }

  if (isValidConfigPayload(latestFrontendConfig)) {
    await sendSettingsUpdate(latestFrontendConfig, 'initial-query-gate');
  }
}

function trackRendererWindow(win) {
  trackRendererWindowRuntime({
    win,
    rendererWindows,
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
    getReplayEvents: () => ipcEventReplayState.snapshot(),
  });
}

function broadcastToRenderers(channel, payload, sourceWebContents = null) {
  broadcastToRenderersRuntime({
    rendererWindows,
    channel,
    payload,
    sourceWebContents,
  });
}

function setResponseOverlayPhase(phase, source = 'ipc', metadata = null) {
  logChatPillMainTrace({
    source: 'ipc',
    action: 'set-phase',
    phase,
    correlationId: metadata?.correlation_id || null,
    reason: source,
  }, {
    getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
  });
  responseOverlayPhaseState.setPhase(phase, source, metadata, {
    onPhaseChange: applyResponseOverlayPhase,
    broadcastToRenderers,
    log,
  });
  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(responseOverlayPhaseState.getPhase()),
    );
  }
}

function connect() {
  if (
    ws &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  ) {
    log('WebSocket already open or connecting.');
    return;
  }

  log(`Attempting to connect to Python backend at ${BACKEND_URL}...`);
  const socket = new WebSocket(BACKEND_URL, { origin: BACKEND_ENDPOINTS.wsOrigin });
  ws = socket;
  let opened = false;

  socket.on('open', () => {
    if (ws !== socket) {
      return;
    }
    opened = true;
    isConnected = true;
    isFirstQuery = true; // Reset on new connection (new session)
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
    ipcEventReplayState.clear();
    log('Successfully connected to Python backend.');

    // Generate valid user_id (backend rejects 'default_user', empty, or whitespace-only)
    currentUserId = generateUserId({
      osUserInfo: () => os.userInfo(),
      uuidGenerator: uuidv4,
      log,
    });
    
    // Send handshake message as required by the backend server
    const handshakeMessage = {
      type: 'handshake',
      user_id: currentUserId,
      operating_system: resolveFrontendOperatingSystem(process.platform),
    };
    try {
      ws.send(JSON.stringify(handshakeMessage));
      log(`Handshake sent with user_id: ${currentUserId}`);
      // Broadcast connection status after handshake send to reduce startup races.
      broadcastConnectionStatus(true);
    } catch (error) {
      log(`Error sending handshake: ${error}`);
    }
  });

  socket.on('message', (message) => {
    if (ws !== socket) {
      return;
    }
    try {
      const data = JSON.parse(message);
      ipcEventReplayState.appendForActiveTurn(data);
      notifyBackendMessageObservers(data);
      processBackendMessageData(data, {
        setCurrentSessionId: (value) => {
          currentSessionId = value;
        },
        setCurrentServerUserId: (value) => {
          currentServerUserId = value;
        },
        setCurrentConversationRef: (value) => {
          currentConversationRef = value;
        },
        resolveSettingsSync: (msgId, wasSuccessful) => {
          resolveSettingsSync(pendingSettingsSyncs, msgId, wasSuccessful);
        },
        setResponseOverlayPhase,
        getResponseOverlayPhase: () => responseOverlayPhaseState.getPhase(),
        onMemoryStoreEvent: (eventData) => {
          persistMemoryStoreEvent(eventData, { storeMemory, log });
        },
        broadcastToRenderers,
        log,
      });
    } catch (error) {
      log(`Error parsing message from backend: ${error}`);
    }
  });

  socket.on('close', () => {
    if (ws !== socket) {
      return;
    }
    isConnected = false;
    resetSettingsSyncState();
    resetBackendSessionState();
    setResponseOverlayPhase('idle', 'ws-close');
    ipcEventReplayState.clear();
    if (!opened && advanceToNextBackendEndpoint()) {
      log(`Primary backend unavailable. Falling back to ${BACKEND_URL}.`);
      broadcastConnectionStatus(false);
      ws = null;
      setTimeout(connect, 0);
      return;
    }
    log('Disconnected from Python backend. Attempting to reconnect...');
    broadcastConnectionStatus(false);
    ws = null;
    setTimeout(connect, reconnectInterval);
  });

  socket.on('error', (error) => {
    if (ws !== socket) {
      return;
    }
    log(`WebSocket error: ${error.message}`);
    if (!opened && advanceToNextBackendEndpoint()) {
      log(`Primary backend unavailable. Falling back to ${BACKEND_URL}.`);
      ws = null;
      connect();
      return;
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
}

function sendMessageToBackend(type, payload, messageId = null) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    log('Cannot send message: WebSocket is not connected.');
    return null;
  }

  if (!currentUserId) {
    log('Cannot send message: user_id not set (handshake may have failed).');
    return null;
  }

  const msgId = messageId || uuidv4();
  const normalizedPayload = normalizeBackendPayload(type, payload);
  const message = {
    id: msgId,
    type,
    payload: normalizedPayload,
    user_id: currentUserId,
    timestamp: new Date().toISOString(),
  };

  try {
    ws.send(JSON.stringify(message));
    // Only log errors, not every message
    return msgId;
  } catch (error) {
    log(`Error sending message to backend: ${error}`);
    return null;
  }
}

function initializeIpc(win, options = {}) {
  refreshBackendEndpoints({
    isPackaged: options.isPackaged === true,
  });
  applyResponseOverlayPhase = typeof options.applyResponseOverlayPhase === 'function'
    ? options.applyResponseOverlayPhase
    : null;
  onBeforeOverlayQueryCapture = typeof options.onBeforeOverlayQueryCapture === 'function'
    ? options.onBeforeOverlayQueryCapture
    : null;
  setAgentLoopStopShortcutEnabled =
    typeof options.setAgentLoopStopShortcutEnabled === 'function'
      ? options.setAgentLoopStopShortcutEnabled
      : null;
  setGlobalAgentStopShortcutAccelerator =
    typeof options.setGlobalAgentStopShortcutAccelerator === 'function'
      ? options.setGlobalAgentStopShortcutAccelerator
      : null;
  const getWindows = typeof options.getWindows === 'function'
    ? options.getWindows
    : () => ({ mainWindow: win, chatWindow: null });
  rendererWindows = new Set();
  trackRendererWindow(win);
  connect();
  loadCachedFrontendConfigFromDisk()
    .then((config) => {
      if (!isValidConfigPayload(config)) {
        return;
      }
      latestFrontendConfig = applyShortcutStatusFallbackToConfig({ ...config });
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(latestFrontendConfig.global_agent_stop_shortcut);
      }
    })
    .catch(() => {});
  if (typeof setAgentLoopStopShortcutEnabled === 'function') {
    setAgentLoopStopShortcutEnabled(
      isAgentLoopStopShortcutPhase(responseOverlayPhaseState.getPhase()),
    );
  }

  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedFrontendConfigFromDisk();
    if (isValidConfigPayload(config)) {
      latestFrontendConfig = applyShortcutStatusFallbackToConfig({ ...config });
      if (typeof setGlobalAgentStopShortcutAccelerator === 'function') {
        setGlobalAgentStopShortcutAccelerator(latestFrontendConfig.global_agent_stop_shortcut);
      }
    }
    return latestFrontendConfig;
  });

  ipcMain.handle('get-client-user-id', async () => {
    return {
      userId: currentUserId,
      conversationRef: currentConversationRef,
      serverUserId: currentServerUserId,
      sessionId: currentSessionId,
      isConnected,
      backendWsUrl: BACKEND_URL,
      backendHttpUrl: BACKEND_HTTP_URL,
      globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
    };
  });

  ipcMain.handle('upload-artifact', async (_event, payload) => {
    return uploadArtifact({
      ...(payload || {}),
      backendHttpUrl: BACKEND_HTTP_URL,
    });
  });

  ipcMain.handle('save-frontend-config', async (event, config) => {
    if (isValidConfigPayload(config) && typeof setGlobalAgentStopShortcutAccelerator === 'function') {
      setGlobalAgentStopShortcutAccelerator(config.global_agent_stop_shortcut);
    }
    return await persistFrontendConfigToDisk(config);
  });

  registerClipboardImageHandler({
    ipcMain,
    clipboard,
    nativeImage,
  });

  ipcMain.handle('openai-codex-oauth-login', async () => {
    try {
      const result = await loginOpenAICodexOAuth({
        openExternal: (url) => shell.openExternal(url),
      });
      return {
        success: true,
        token: result.token,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth login failed.'),
      };
    }
  });

  ipcMain.handle('openai-codex-oauth-logout', async () => {
    try {
      const result = await logoutOpenAICodexOAuth();
      return {
        success: true,
        removed: result.removed,
        auth_path: result.authPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error?.message || error || 'OpenAI Codex OAuth sign-out failed.'),
      };
    }
  });

  ipcMain.on('transcript-session-sync', (event, payload = {}) => {
    const syncResult = applyTranscriptSessionSync({
      payload,
      sender: event?.sender || null,
      currentConversationRef,
      currentUserId,
      broadcastToRenderers,
    });
    if (!syncResult) {
      return;
    }

    currentConversationRef = syncResult.nextConversationRef;
    currentUserId = syncResult.nextUserId;
  });

  ipcMain.on('to-backend', async (event, message = {}) => {
    const type = typeof message?.type === 'string' ? message.type : null;
    const payload = (
      message?.payload
      && typeof message.payload === 'object'
      && !Array.isArray(message.payload)
    ) ? { ...message.payload } : {};

    if (!type) {
      log('Ignoring malformed to-backend message: missing string "type"');
      return;
    }

    if (type === 'update-settings') {
      sendSettingsUpdate(payload, 'renderer-update');
      return;
    }

    if (type === 'stop-query') {
      setResponseOverlayPhase('complete', 'stop-query');
    }

    // Only log important message types
    if (type === 'query' || type === 'wakeword-detected') {
      log(`Received ${type} from renderer`);
      await ensureInitialSettingsSync();
      if (pendingSettingsSyncPromise) {
        await pendingSettingsSyncPromise;
      }
    }

    let queryMessageId = null;
    let queryUsedInitialContext = false;

    // Build complete user message content with system state and memories
    // System context MUST be retrieved - never skip it
    if (type === 'query') {
      await runBeforeOverlayQueryCapture({
        webContents: event.sender,
        onBeforeOverlayQueryCapture,
        log,
      });
      const preparedQuery = prepareRendererQueryPayload(
        payload,
        currentConversationRef,
        resolveConversationRefFromPayload,
      );
      const {
        payload: preparedPayload,
        attachmentContext,
        conversationRef,
        memoryRetrievalEnabled,
      } = preparedQuery;
      Object.keys(payload).forEach((key) => {
        delete payload[key];
      });
      Object.assign(payload, preparedPayload);
      currentConversationRef = conversationRef;
      queryMessageId = uuidv4();
      logChatPillMainTrace({
        source: 'ipc',
        action: 'query-send-accepted',
        turnId: queryMessageId,
      });
      setResponseOverlayPhase('awaiting-first-chunk', 'query');
      const { mainWindow, chatWindow } = getWindows();
      setActiveDisplayAffinity(resolveActiveSurfaceDisplayAffinity({
        BrowserWindow,
        screen,
        webContents: event.sender,
        chatWindow,
        mainWindow,
      }));
      const localUserMessage = broadcastLocalUserMessageRuntime({
        sourceWebContents: event.sender,
        payload,
        queryMessageId,
        conversationRef,
        currentSessionId,
        currentServerUserId,
        currentUserId,
        backendHttpUrl: BACKEND_HTTP_URL,
        buildLocalUserMessage,
        broadcastToRenderers: ({ channel, payload: messagePayload, sourceWebContents }) => {
          broadcastToRenderers(channel, messagePayload, sourceWebContents);
        },
      });
      ipcEventReplayState.startTurn(queryMessageId, localUserMessage);
      const contextType = isFirstQuery ? 'initial' : 'sequential';
      queryUsedInitialContext = contextType === 'initial';
      const preparedContent = await buildQueryPayload({
        basePayload: payload,
        text: payload.text,
        conversationRef,
        attachmentContext,
        memoryRetrievalEnabled,
        currentUserId,
        isFirstQuery,
        buildQueryPayloadContent,
        getSystemState,
        searchMemory,
        generateUserId,
        osUserInfo: () => os.userInfo(),
        uuidGenerator: uuidv4,
        log,
      });
      Object.keys(payload).forEach((key) => {
        delete payload[key];
      });
      Object.assign(payload, preparedContent.payload);
      log('Complete user message built successfully');
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    const messageId = sendMessageToBackend(type, payload, queryMessageId);
    if (!messageId && type === 'query') {
      ipcEventReplayState.clear();
      broadcastQuerySendFailureRuntime({
        queryMessageId,
        conversationRef: resolveConversationRefFromPayload(payload, currentConversationRef),
        currentSessionId,
        currentServerUserId,
        currentUserId,
        buildQuerySendFailure,
        setResponseOverlayPhase,
        broadcastToRenderers: ({ channel, payload: messagePayload, sourceWebContents }) => {
          broadcastToRenderers(channel, messagePayload, sourceWebContents);
        },
      });
    } else if (type === 'query' && queryUsedInitialContext) {
      isFirstQuery = false;
    }
  });
}

function triggerStopQueryFromMain() {
  const messageId = sendMessageToBackend('stop-query', currentConversationRef
    ? { conversation_ref: currentConversationRef }
    : {});
  if (!messageId) {
    return false;
  }
  setResponseOverlayPhase('complete', 'stop-query');
  return true;
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

function getLatestFrontendConfig() {
  if (!isValidConfigPayload(latestFrontendConfig)) {
    return null;
  }
  return { ...latestFrontendConfig };
}

function registerBackendMessageObserver(observer) {
  if (typeof observer !== 'function') {
    return () => {};
  }
  backendMessageObservers.add(observer);
  return () => {
    backendMessageObservers.delete(observer);
  };
}

function getBackendConnectionState() {
  return {
    isConnected,
    userId: currentUserId,
    sessionId: currentSessionId,
    serverUserId: currentServerUserId,
    conversationRef: currentConversationRef,
    backendWsUrl: BACKEND_URL,
    backendHttpUrl: BACKEND_HTTP_URL,
    globalAgentStopShortcutStatus: currentGlobalAgentStopShortcutStatus,
  };
}

async function sendAutomatedQuery(options = {}) {
  const preparedQuery = prepareAutomatedQueryPayload(options, currentConversationRef);
  if (!preparedQuery) {
    return { ok: false, error: 'Missing query text' };
  }

  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    return { ok: false, error: 'Backend websocket is not connected' };
  }

  await ensureInitialSettingsSync();
  if (pendingSettingsSyncPromise) {
    await pendingSettingsSyncPromise;
  }

  const conversationRef = preparedQuery.conversationRef || `vm-run-${uuidv4()}`;
  const builtQuery = await buildQueryPayload({
    basePayload: {},
    text: preparedQuery.text,
    conversationRef,
    attachmentContext: preparedQuery.attachmentContext,
    memoryRetrievalEnabled: preparedQuery.memoryRetrievalEnabled,
    currentUserId,
    isFirstQuery,
    buildQueryPayloadContent,
    getSystemState,
    searchMemory,
    generateUserId,
    osUserInfo: () => os.userInfo(),
    uuidGenerator: uuidv4,
    log,
  });

  const payload = {
    text: preparedQuery.text,
    conversation_ref: conversationRef,
    ...builtQuery.payload,
  };
  if (preparedQuery.attachmentFilenames.length > 0) {
    payload.attachment_filenames = preparedQuery.attachmentFilenames;
  }

  const queryMessageId = uuidv4();
  const messageId = sendMessageToBackend('query', payload, queryMessageId);
  if (!messageId) {
    return { ok: false, error: 'Failed to send query to backend' };
  }

  currentConversationRef = conversationRef;
  if (builtQuery.queryUsedInitialContext) {
    isFirstQuery = false;
  }
  return {
    ok: true,
    messageId,
    queryMessageId,
    conversationRef,
    userId: builtQuery.userId,
  };
}

module.exports = {
  getBackendConnectionState,
  getLatestFrontendConfig,
  initializeIpc,
  registerBackendMessageObserver,
  registerRendererWindow,
  sendAutomatedQuery,
  sendMessageToBackend,
  triggerStopQueryFromMain,
  updateGlobalAgentStopShortcutStatus,
};
