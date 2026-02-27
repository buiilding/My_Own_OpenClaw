const { ipcMain } = require('electron');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { getSystemState, searchMemory, storeMemory } = require('./local_backend_bridge.cjs');
const { resolveBackendEndpoints } = require('./backend_endpoints.cjs');
const {
  loadFrontendConfigFromDisk,
  saveFrontendConfigToDisk,
} = require('./ipc_frontend_config.cjs');
const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('./ipc_settings_sync.cjs');
const { persistMemoryStoreEvent } = require('./ipc_memory_store_persistence.cjs');
const { buildQueryPayloadContent } = require('./query_payload_builder.cjs');
const {
  resolveConversationRef: resolveConversationRefFromPayload,
  buildLocalUserMessage,
  buildQuerySendFailure,
} = require('./ipc_query_events.cjs');
const {
  generateUserId,
  normalizeBackendPayload,
  processBackendMessageData,
  runBeforeOverlayQueryCapture,
  uploadArtifact,
} = require('./ipc_runtime_helpers.cjs');
const {
  trackRendererWindow: trackRendererWindowRuntime,
  broadcastToRenderers: broadcastToRenderersRuntime,
} = require('./ipc_renderer_windows.cjs');
const {
  broadcastLocalUserMessage: broadcastLocalUserMessageRuntime,
  broadcastQuerySendFailure: broadcastQuerySendFailureRuntime,
} = require('./ipc_query_broadcast.cjs');

let BACKEND_ENDPOINTS = resolveBackendEndpoints();
let BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
let BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
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
let onResponseOverlayPhaseChange = null;
let onBeforeOverlayQueryCapture = null;
let responseOverlayPhase = 'idle';
const RESPONSE_OVERLAY_PHASES = new Set([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'tool-call',
  'tool-output',
  'complete',
  'error',
]);

function refreshBackendEndpoints(options = {}) {
  BACKEND_ENDPOINTS = resolveBackendEndpoints(process.env, options);
  BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
  BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
}

function log(message) {
  // Only log in development - production logging adds overhead
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[IPC Bridge] ${message}`);
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
  };
}

function broadcastConnectionStatus(connected) {
  broadcastToRenderers('ipc-status', buildIpcStatusPayload(connected));
}

function sendSettingsUpdate(config, source = 'renderer') {
  if (!isValidConfigPayload(config)) {
    return Promise.resolve(false);
  }
  latestFrontendConfig = { ...config };
  const msgId = sendMessageToBackend('update-settings', config);
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
    getResponseOverlayPhase: () => responseOverlayPhase,
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

function setResponseOverlayPhase(phase, source = 'ipc') {
  if (!RESPONSE_OVERLAY_PHASES.has(phase)) {
    return;
  }
  if (responseOverlayPhase === phase) {
    return;
  }
  responseOverlayPhase = phase;
  const payload = { phase, source };
  if (typeof onResponseOverlayPhaseChange === 'function') {
    try {
      onResponseOverlayPhaseChange(payload);
    } catch (error) {
      log(`Response overlay phase callback failed: ${error.message}`);
    }
  }
  broadcastToRenderers('response-overlay-phase', payload);
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
  ws = new WebSocket(BACKEND_URL, { origin: BACKEND_ENDPOINTS.wsOrigin });

  ws.on('open', () => {
    isConnected = true;
    isFirstQuery = true; // Reset on new connection (new session)
    resetSettingsSyncState();
    setResponseOverlayPhase('idle', 'ws-open');
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
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
        getResponseOverlayPhase: () => responseOverlayPhase,
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

  ws.on('close', () => {
    isConnected = false;
    resetSettingsSyncState();
    resetBackendSessionState();
    setResponseOverlayPhase('idle', 'ws-close');
    log('Disconnected from Python backend. Attempting to reconnect...');
    broadcastConnectionStatus(false);
    setTimeout(connect, reconnectInterval);
  });

  ws.on('error', (error) => {
    log(`WebSocket error: ${error.message}`);
    if (ws.readyState !== WebSocket.OPEN) {
      // No need to explicitly close if it's already closed or closing
    } else {
      ws.close();
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
  onResponseOverlayPhaseChange = typeof options.onResponseOverlayPhaseChange === 'function'
    ? options.onResponseOverlayPhaseChange
    : null;
  onBeforeOverlayQueryCapture = typeof options.onBeforeOverlayQueryCapture === 'function'
    ? options.onBeforeOverlayQueryCapture
    : null;
  rendererWindows = new Set();
  trackRendererWindow(win);
  connect();

  ipcMain.handle('load-frontend-config', async () => {
    const config = await loadCachedFrontendConfigFromDisk();
    if (isValidConfigPayload(config)) {
      latestFrontendConfig = { ...config };
    }
    return config;
  });

  ipcMain.handle('get-client-user-id', async () => {
    return {
      userId: currentUserId,
      isConnected,
      backendWsUrl: BACKEND_URL,
      backendHttpUrl: BACKEND_HTTP_URL,
    };
  });

  ipcMain.handle('upload-artifact', async (_event, payload) => {
    return uploadArtifact({
      ...(payload || {}),
      backendHttpUrl: BACKEND_HTTP_URL,
    });
  });

  ipcMain.handle('save-frontend-config', async (event, config) => {
    return await persistFrontendConfigToDisk(config);
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
      const memoryRetrievalEnabled = payload.memory_retrieval_enabled !== false;
      delete payload.memory_retrieval_enabled;
      queryMessageId = uuidv4();
      setResponseOverlayPhase('awaiting-first-chunk', 'query');
      const conversationRef = resolveConversationRefFromPayload(payload, currentConversationRef);
      if (!payload.conversation_ref && conversationRef) {
        payload.conversation_ref = conversationRef;
      }
      broadcastLocalUserMessageRuntime({
        sourceWebContents: event.sender,
        payload,
        queryMessageId,
        conversationRef,
        currentSessionId,
        currentServerUserId,
        currentUserId,
        buildLocalUserMessage,
        broadcastToRenderers: ({ channel, payload: messagePayload, sourceWebContents }) => {
          broadcastToRenderers(channel, messagePayload, sourceWebContents);
        },
      });
      const contextType = isFirstQuery ? 'initial' : 'sequential';
      queryUsedInitialContext = contextType === 'initial';
      const userId = currentUserId || generateUserId({
        osUserInfo: () => os.userInfo(),
        uuidGenerator: uuidv4,
        log,
      });
      const {
        content: completeContent,
        runtimeSystemState,
      } = await buildQueryPayloadContent({
        text: payload.text,
        conversationRef,
        userId,
        contextType,
        getSystemState,
        searchMemory,
        memoryRetrievalEnabled,
        log,
      });
      payload.content = completeContent;
      if (runtimeSystemState) {
        payload.system_state_internal = runtimeSystemState;
      } else {
        delete payload.system_state_internal;
      }
      log('Complete user message built successfully');
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    const messageId = sendMessageToBackend(type, payload, queryMessageId);
    if (!messageId && type === 'query') {
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

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

function getLatestFrontendConfig() {
  if (!isValidConfigPayload(latestFrontendConfig)) {
    return null;
  }
  return { ...latestFrontendConfig };
}

module.exports = {
  getLatestFrontendConfig,
  initializeIpc,
  registerRendererWindow,
  sendMessageToBackend,
};
