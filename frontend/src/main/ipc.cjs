/**
 * IPC Bridge for communication between Electron's main process,
 * renderer process, and the Python backend.
 */

const { ipcMain, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { getSystemState, searchMemory } = require('./local_backend_bridge.cjs');
const { resolveBackendEndpoints } = require('./backend_endpoints.cjs');
const { buildQueryPayloadContent } = require('./query_payload_builder.cjs');

const BACKEND_ENDPOINTS = resolveBackendEndpoints();
const BACKEND_URL = BACKEND_ENDPOINTS.wsUrl;
const BACKEND_HTTP_URL = BACKEND_ENDPOINTS.httpUrl;
const SETTINGS_SYNC_TIMEOUT_MS = 2500;
let ws = null;
let mainWindow = null;
let rendererWindows = new Set();
let isConnected = false;
let reconnectInterval = 5000; // 5 seconds
let isFirstQuery = true; // Track if this is the first user query in the session
let currentUserId = null; // Store user_id after successful handshake
let currentSessionId = null; // Store session_id from backend responses
let currentServerUserId = null; // Store server-assigned user_id from backend responses
let currentConversationRef = null; // Store active conversation_ref from backend responses
let latestFrontendConfig = null; // Last known frontend config for session bootstrap
let hasAttemptedInitialSettingsSync = false; // One-time per connection query gate
let pendingSettingsSyncPromise = null; // Last outbound update-settings ACK promise
const pendingSettingsSyncs = new Map(); // msg_id -> { resolve, timer }
let onResponseOverlayPhaseChange = null;
let responseOverlayPhase = 'idle';

const RESPONSE_OVERLAY_PHASES = new Set([
  'idle',
  'awaiting-first-chunk',
  'streaming',
  'complete',
  'error',
]);

const FRONTEND_CONFIG_FILENAME = 'frontend-config.json';

function getFrontendConfigPath() {
  return path.join(app.getPath('userData'), FRONTEND_CONFIG_FILENAME);
}

async function loadFrontendConfigFromDisk() {
  try {
    const filePath = getFrontendConfigPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      log('Frontend config on disk is invalid; ignoring');
      return null;
    }
    return parsed;
  } catch (error) {
    log(`Failed to load frontend config from disk: ${error.message}`);
    return null;
  }
}

async function saveFrontendConfigToDisk(config) {
  try {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { success: false, error: 'Invalid config payload' };
    }
    latestFrontendConfig = { ...config };
    const filePath = getFrontendConfigPath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, filePath);
    return { success: true };
  } catch (error) {
    log(`Failed to save frontend config to disk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function log(message) {
  // Only log in development - production logging adds overhead
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[IPC Bridge] ${message}`);
  }
}

function logDebug(message) {
  // Debug logging - can be enabled for troubleshooting
  // console.log(`[IPC Bridge] ${message}`);
}

function clearPendingSettingsSyncs() {
  for (const { resolve, timer } of pendingSettingsSyncs.values()) {
    clearTimeout(timer);
    resolve(false);
  }
  pendingSettingsSyncs.clear();
}

function resetSettingsSyncState() {
  hasAttemptedInitialSettingsSync = false;
  pendingSettingsSyncPromise = null;
  clearPendingSettingsSyncs();
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

function resolveSettingsSync(msgId, wasSuccessful) {
  const pending = pendingSettingsSyncs.get(msgId);
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pendingSettingsSyncs.delete(msgId);
  pending.resolve(Boolean(wasSuccessful));
}

function waitForSettingsAck(msgId, source) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSettingsSyncs.delete(msgId);
      log(`Settings sync timeout (${source}) for message ${msgId}`);
      resolve(false);
    }, SETTINGS_SYNC_TIMEOUT_MS);
    pendingSettingsSyncs.set(msgId, { resolve, timer });
  });
}

function isValidConfigPayload(config) {
  return Boolean(config) && typeof config === 'object' && !Array.isArray(config);
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
  const ackPromise = waitForSettingsAck(msgId, source);
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
    latestFrontendConfig = await loadFrontendConfigFromDisk();
  }

  if (isValidConfigPayload(latestFrontendConfig)) {
    await sendSettingsUpdate(latestFrontendConfig, 'initial-query-gate');
  }
}

async function uploadArtifact({ base64, contentType, filename }) {
  if (!base64 || typeof base64 !== 'string') {
    return { success: false, error: 'Missing artifact data' };
  }

  const resolvedContentType = contentType || 'application/octet-stream';
  const ext = resolvedContentType === 'image/png' ? 'png' : 'jpg';
  const safeName = filename && typeof filename === 'string' ? filename : `artifact.${ext}`;

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: resolvedContentType });
    const form = new FormData();
    form.append('file', blob, safeName);

    const response = await fetch(`${BACKEND_HTTP_URL}/api/artifacts/`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Upload failed (${response.status}): ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
}

function trackRendererWindow(win) {
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
  const syncResponseOverlayPhase = () => {
    if (!win || win.isDestroyed()) {
      return;
    }
    if (!webContents || typeof webContents.send !== 'function') {
      return;
    }
    webContents.send('response-overlay-phase', {
      phase: responseOverlayPhase,
      source: 'sync',
    });
  };
  if (canSubscribeToLoad) {
    webContents.on('did-finish-load', syncResponseOverlayPhase);
  }
  if (!canCheckLoadingState || !webContents.isLoadingMainFrame()) {
    syncResponseOverlayPhase();
  }
  if (typeof win.on !== 'function') {
    return;
  }
  win.on('closed', () => {
    if (canSubscribeToLoad) {
      webContents.removeListener('did-finish-load', syncResponseOverlayPhase);
    }
    rendererWindows.delete(win);
  });
}

function broadcastToRenderers(channel, payload, sourceWebContents = null) {
  for (const win of rendererWindows) {
    if (!win || win.isDestroyed()) {
      rendererWindows.delete(win);
      continue;
    }
    if (sourceWebContents && win.webContents === sourceWebContents) {
      continue;
    }
    win.webContents.send(channel, payload);
  }
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

/**
 * Generate a valid user_id from system username or fallback to UUID-based ID.
 * Backend rejects 'default_user', empty, or whitespace-only values.
 */
function generateUserId() {
  try {
    const username = os.userInfo().username;
    if (username && username.trim() && username !== 'default_user') {
      // Sanitize username to match backend validation pattern (alphanumeric, underscore, hyphen)
      return username.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 128);
    }
  } catch (error) {
    log(`Failed to get system username: ${error.message}`);
  }
  // Fallback: generate UUID-based user_id (backend accepts alphanumeric, underscore, hyphen)
  return `user_${uuidv4().replace(/-/g, '_')}`;
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
    currentUserId = generateUserId();
    
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
      if (data && typeof data === 'object') {
        if (data.session_id) {
          currentSessionId = data.session_id;
        }
        if (data.user_id) {
          currentServerUserId = data.user_id;
        }
        if (data.conversation_ref) {
          currentConversationRef = data.conversation_ref;
        }
      }
      // Only log errors or important message types
      if (data.type === 'error') {
        log(`Error from backend: ${data.payload?.message || 'Unknown error'}`);
      }
      if (data.type === 'settings-updated' && data.id) {
        resolveSettingsSync(data.id, true);
      } else if (data.type === 'error' && data.id) {
        resolveSettingsSync(data.id, false);
      }
      if (data.type === 'streaming-response') {
        setResponseOverlayPhase('streaming', 'backend');
      } else if (data.type === 'streaming-complete') {
        setResponseOverlayPhase('complete', 'backend');
      } else if (data.type === 'error' && responseOverlayPhase !== 'idle') {
        setResponseOverlayPhase('error', 'backend');
      }
      broadcastToRenderers('from-backend', data);
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

/**
 * Sends a structured message to the Python backend via WebSocket.
 *
 * @param {string} type - The message type (e.g., 'query').
 * @param {object} payload - The JSON object payload for the message.
 */
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

/**
 * Normalize outbound payloads to backend-supported schema fields.
 */
function normalizeBackendPayload(type, payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const normalized = { ...payload };

  if (type === 'query' || type === 'tool-bundle-result') {
    delete normalized.screenshot_url;
  }

  return normalized;
}

/**
 * Initializes the IPC bridge and establishes the WebSocket connection.
 * This function should be called once when the main Electron window is created.
 *
 * @param {BrowserWindow} win - The main Electron BrowserWindow instance.
 * @param {object} options - Optional lifecycle callbacks.
 */
function initializeIpc(win, options = {}) {
  mainWindow = win;
  onResponseOverlayPhaseChange = typeof options.onResponseOverlayPhaseChange === 'function'
    ? options.onResponseOverlayPhaseChange
    : null;
  rendererWindows = new Set();
  trackRendererWindow(win);
  connect();

  ipcMain.handle('load-frontend-config', async () => {
    return await loadFrontendConfigFromDisk();
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
    return uploadArtifact(payload || {});
  });

  ipcMain.handle('save-frontend-config', async (event, config) => {
    return await saveFrontendConfigToDisk(config);
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

    // Build complete user message content with system state and memories
    // System context MUST be retrieved - never skip it
    if (type === 'query') {
      queryMessageId = uuidv4();
      setResponseOverlayPhase('awaiting-first-chunk', 'query');
      const conversationRef = payload?.conversation_ref || currentConversationRef || null;
      if (payload?.text) {
        broadcastToRenderers('from-backend', {
          type: 'local-user-message',
          turn_ref: queryMessageId,
          session_id: currentSessionId || null,
          user_id: currentServerUserId || null,
          conversation_ref: conversationRef,
          payload: {
            text: payload.text,
            screenshot_ref: payload.screenshot_ref || null,
            screenshot_url: payload.screenshot_url || null,
            timestamp: new Date().toISOString(),
            session_id: currentSessionId || null,
            user_id: currentServerUserId || null,
            conversation_ref: conversationRef,
          },
        }, event.sender);
      }
      const contextType = isFirstQuery ? 'initial' : 'sequential';
      isFirstQuery = false;
      const userId = currentUserId || generateUserId();
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
      setResponseOverlayPhase('idle', 'query-send-failed');
    }
  });
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

module.exports = {
  initializeIpc,
  registerRendererWindow,
  sendMessageToBackend,
};
