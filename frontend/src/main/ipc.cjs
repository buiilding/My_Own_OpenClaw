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

const BACKEND_PORT = process.env.BACKEND_PORT || 8765;
const BACKEND_URL = `ws://127.0.0.1:${BACKEND_PORT}/ws`;
let ws = null;
let mainWindow = null;
let isConnected = false;
let reconnectInterval = 5000; // 5 seconds
let isFirstQuery = true; // Track if this is the first user query in the session
let currentUserId = null; // Store user_id after successful handshake

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
  ws = new WebSocket(BACKEND_URL, { origin: 'http://localhost:5173' });

  ws.on('open', () => {
    isConnected = true;
    isFirstQuery = true; // Reset on new connection (new session)
    log('Successfully connected to Python backend.');
    mainWindow?.webContents.send('ipc-status', { isConnected: true });

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
    } catch (error) {
      log(`Error sending handshake: ${error}`);
    }
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Only log errors or important message types
      if (data.type === 'error') {
        log(`Error from backend: ${data.payload?.message || 'Unknown error'}`);
      }
      mainWindow?.webContents.send('from-backend', data);
    } catch (error) {
      log(`Error parsing message from backend: ${error}`);
    }
  });

  ws.on('close', () => {
    isConnected = false;
    log('Disconnected from Python backend. Attempting to reconnect...');
    mainWindow?.webContents.send('ipc-status', { isConnected: false });
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
function sendMessageToBackend(type, payload) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    log('Cannot send message: WebSocket is not connected.');
    return;
  }

  if (!currentUserId) {
    log('Cannot send message: user_id not set (handshake may have failed).');
    return;
  }

  const message = {
    id: uuidv4(),
    type,
    payload: payload || {},
    user_id: currentUserId,
    timestamp: new Date().toISOString(),
  };

  try {
    ws.send(JSON.stringify(message));
    // Only log errors, not every message
  } catch (error) {
    log(`Error sending message to backend: ${error}`);
  }
}

/**
 * Initializes the IPC bridge and establishes the WebSocket connection.
 * This function should be called once when the main Electron window is created.
 *
 * @param {BrowserWindow} win - The main Electron BrowserWindow instance.
 */
function initializeIpc(win) {
  mainWindow = win;
  connect();

  ipcMain.handle('load-frontend-config', async () => {
    return await loadFrontendConfigFromDisk();
  });

  ipcMain.handle('save-frontend-config', async (event, config) => {
    return await saveFrontendConfigToDisk(config);
  });

  ipcMain.on('to-backend', async (event, { type, payload }) => {
    // Only log important message types
    if (type === 'query' || type === 'wakeword-detected') {
      log(`Received ${type} from renderer`);
    }

    // Build complete user message content with system state and memories
    // System context MUST be retrieved - never skip it
    if (type === 'query') {
      try {
        log('Building complete user message with system state and memories...');
        
        // Determine context type: 'initial' for first query, 'sequential' for subsequent
        const contextType = isFirstQuery ? 'initial' : 'sequential';
        isFirstQuery = false; // Mark that we've sent at least one query
        
        // Start memory search first since it's slower (needs backend API call + FAISS search)
        // Then start system state in parallel - both run concurrently
        const userId = currentUserId || generateUserId();
        const memoryPromise = searchMemory(payload.text, userId, 5, null).catch(err => {
          log(`Memory search failed: ${err.message}`);
          return { success: false, data: { memories: { episodic: [], semantic: [] } } };
        }); // Start memory search immediately
        // Request only needed fields based on context type
        const requestedFields = contextType === 'initial' 
          ? ['active_window', 'mouse_position', 'screen_resolution', 'windows']
          : ['active_window', 'mouse_position'];
        
        const statePromise = getSystemState(requestedFields).then(state => {
          // Format system state as XML based on context type
          if (contextType === 'initial') {
            return formatInitialStateXml(state);
          } else {
            return formatSequentialStateXml(state);
          }
        }).catch(err => {
          log(`System state failed: ${err.message}`);
          return formatFallbackStateXml();
        }); // Start system state immediately (parallel)
        
        // Wait for both to complete - system context is REQUIRED, memories are optional
        const [stateResponse, memoryResponse] = await Promise.allSettled([
          statePromise,   // REQUIRED - must complete
          memoryPromise   // Optional - can fail
        ]);

        // Build message content parts
        const parts = [];

        // 1. System state XML (REQUIRED - must be present)
        let systemStateXml = null;
        if (stateResponse.status === 'fulfilled' && stateResponse.value) {
          systemStateXml = stateResponse.value;
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
        
        log('Complete user message built successfully');
      } catch (error) {
        log(`ERROR: Failed to build user message: ${error.message}`);
        // Fallback: include minimal system context even on error
        const fallbackContext = formatFallbackStateXml();
        payload.content = `${fallbackContext}\n\n<user_query>\n${payload.text}\n</user_query>`;
        log('Using fallback system context in error handler');
      }
    }

    // System context is now pre-formatted in llm_content by ChatContext.jsx
    // No need to extract or add system_context here - backend expects pre-formatted messages
    
    sendMessageToBackend(type, payload);
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

module.exports = {
  initializeIpc,
  sendMessageToBackend,
};
