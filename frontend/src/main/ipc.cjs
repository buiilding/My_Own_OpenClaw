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
    hasAttemptedInitialSettingsSync = false;
    pendingSettingsSyncPromise = null;
    clearPendingSettingsSyncs();
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
      broadcastToRenderers('ipc-status', {
        isConnected: true,
        userId: currentUserId,
        backendWsUrl: BACKEND_URL,
        backendHttpUrl: BACKEND_HTTP_URL,
      });
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
    hasAttemptedInitialSettingsSync = false;
    pendingSettingsSyncPromise = null;
    clearPendingSettingsSyncs();
    currentSessionId = null;
    currentServerUserId = null;
    currentConversationRef = null;
    setResponseOverlayPhase('idle', 'ws-close');
    log('Disconnected from Python backend. Attempting to reconnect...');
    broadcastToRenderers('ipc-status', {
      isConnected: false,
      userId: currentUserId,
      backendWsUrl: BACKEND_URL,
      backendHttpUrl: BACKEND_HTTP_URL,
    });
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

  ipcMain.on('to-backend', async (event, { type, payload }) => {
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
      try {
        log('Building complete user message with system state and memories...');
        
        // Determine context type: 'initial' for first query, 'sequential' for subsequent
        const contextType = isFirstQuery ? 'initial' : 'sequential';
        isFirstQuery = false; // Mark that we've sent at least one query
        
        // Start memory search first since it's slower (needs backend API call + FAISS search)
        // Then start system state in parallel - both run concurrently
        const userId = currentUserId || generateUserId();
        const memoryPromise = searchMemory(payload.text, userId, 5, null, conversationRef).catch(err => {
          log(`Memory search failed: ${err.message}`);
          return { success: false, data: { memories: { episodic: [], semantic: [] } } };
        }); // Start memory search immediately
        // Request only needed fields based on context type
        const requestedFields = contextType === 'initial'
          ? ['active_window', 'mouse_position', 'screen_resolution', 'windows']
          : ['active_window', 'mouse_position', 'screen_resolution'];
        
        const statePromise = getSystemState(requestedFields).then(state => ({
          systemStateXml: contextType === 'initial'
            ? formatInitialStateXml(state)
            : formatSequentialStateXml(state),
          runtimeSystemState: extractQueryRuntimeSystemState(state),
        })); // Start system state immediately (parallel)
        
        // Wait for both to complete - system context is REQUIRED, memories are optional
        const [stateResponse, memoryResponse] = await Promise.allSettled([
          statePromise,   // REQUIRED - must complete
          memoryPromise   // Optional - can fail
        ]);

        // Build message content parts
        const parts = [];

        // 1. System state XML (REQUIRED - must be present)
        let systemStateXml = null;
        let runtimeSystemState = null;
        if (stateResponse.status === 'fulfilled' && stateResponse.value) {
          systemStateXml = stateResponse.value.systemStateXml;
          runtimeSystemState = stateResponse.value.runtimeSystemState || null;
          parts.push(systemStateXml.trim());
          log('System state added to message');
        } else {
          // System context is REQUIRED - log error but continue with fallback
          const errorMsg = stateResponse.status === 'rejected' 
            ? stateResponse.reason?.message || 'Unknown error'
            : 'No system state data in response';
          log(`ERROR: System state enrichment failed: ${errorMsg}`);
          // Add minimal fallback system context
          systemStateXml = formatFallbackStateXml();
          parts.push(systemStateXml);
          log('Using fallback system context');
        }

        // 2. Memory sections
        let memories = null;
        // Response structure: { success: true, data: { memories: {...} } }
        const responseData = memoryResponse.status === 'fulfilled' ? memoryResponse.value : null;
        if (responseData?.success && responseData?.data?.memories) {
          memories = responseData.data.memories;
          log(`Memory response received - episodic: ${memories.episodic?.length || 0}, semantic: ${memories.semantic?.length || 0}`);
          
          // Add episodic memory section
          if (memories.episodic && memories.episodic.length > 0) {
            const episodicText = memories.episodic.map(m => `- ${m}`).join('\n');
            parts.push(`<episodic_memory>\n${episodicText}\n</episodic_memory>`);
          } else {
            parts.push('<episodic_memory>\nNone\n</episodic_memory>');
          }
          
          // Add semantic memory section
          if (memories.semantic && memories.semantic.length > 0) {
            const semanticText = memories.semantic.map(m => `- ${m}`).join('\n');
            parts.push(`<semantic_memory>\n${semanticText}\n</semantic_memory>`);
          } else {
            parts.push('<semantic_memory>\nNone\n</semantic_memory>');
          }
          
          log('Memories added to message');
        } else {
          // Log why memories weren't added
          if (memoryResponse.status === 'rejected') {
            log(`Memory enrichment failed: ${memoryResponse.reason?.message || 'Unknown error'}`);
          } else if (memoryResponse.status === 'fulfilled') {
            const data = memoryResponse.value;
            log(`Memory response structure: success=${data?.success}, hasData=${!!data?.data}, hasMemories=${!!data?.data?.memories}`);
            if (data && !data.data?.memories) {
              log(`Memory data keys: ${Object.keys(data).join(', ')}`);
              if (data.data) {
                log(`Memory data keys: ${Object.keys(data.data).join(', ')}`);
              }
            }
          } else {
            log(`Memory response status: ${memoryResponse.status}`);
          }
          // Add empty memory sections if search failed
          parts.push('<episodic_memory>\nNone\n</episodic_memory>');
          parts.push('<semantic_memory>\nNone\n</semantic_memory>');
        }

        // 3. User query
        parts.push(`<user_query>\n${payload.text}\n</user_query>`);

        // Build complete content
        const completeContent = parts.join('\n\n');
        
        // Replace payload with complete content
        payload.content = completeContent;
        payload.text = payload.text; // Keep original text for reference
        if (runtimeSystemState) {
          payload.system_state_internal = runtimeSystemState;
        } else {
          delete payload.system_state_internal;
        }
        
        log('Complete user message built successfully');
      } catch (error) {
        log(`ERROR: Failed to build user message: ${error.message}`);
        // Fallback: include minimal system context even on error
        const fallbackContext = formatFallbackStateXml();
        payload.content = `${fallbackContext}\n\n<user_query>\n${payload.text}\n</user_query>`;
        delete payload.system_state_internal;
        log('Using fallback system context in error handler');
      }
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    const messageId = sendMessageToBackend(type, payload, queryMessageId);
    if (!messageId && type === 'query') {
      setResponseOverlayPhase('idle', 'query-send-failed');
    }
  });
}

/**
 * Format system state as initial XML (with all windows and stats)
 */
function formatInitialStateXml(state) {
  const windows = state.windows || [];
  const windowsXml = windows.map(w => `        <window>${w}</window>`).join('\n');
  
  return `<system_context>
    <os_state>
        <active_window>${state.active_window || 'Unknown'}</active_window>
        <mouse_position>${state.mouse_position || 'Unknown'}</mouse_position>
        <screen_resolution>${state.screen_resolution || 'Unknown'}</screen_resolution>
        <all_open_windows>
${windowsXml}
        </all_open_windows>
    </os_state>
</system_context>`;
}

/**
 * Format system state as sequential XML (minimal)
 */
function formatSequentialStateXml(state) {
  return `<system_context>
    <os_state>
        <active_window>${state.active_window || 'Unknown'}</active_window>
        <mouse_position>${state.mouse_position || 'Unknown'}</mouse_position>
    </os_state>
</system_context>`;
}

function extractQueryRuntimeSystemState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const resolution = typeof state.screen_resolution === 'string'
    ? state.screen_resolution.trim()
    : '';
  if (!resolution) {
    return null;
  }
  return {
    screen_resolution: resolution,
  };
}

/**
 * Format fallback system state XML
 */
function formatFallbackStateXml() {
  return `<system_context>
    <os_state>
        <active_window>Unknown</active_window>
    </os_state>
</system_context>`;
}

function registerRendererWindow(win) {
  trackRendererWindow(win);
}

module.exports = {
  initializeIpc,
  registerRendererWindow,
  sendMessageToBackend,
};
