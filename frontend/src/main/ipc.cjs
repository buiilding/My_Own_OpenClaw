/**
 * IPC Bridge for communication between Electron's main process,
 * renderer process, and the Python backend.
 */

const { ipcMain, BrowserWindow } = require('electron');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { getSystemState, getMemories } = require('./tool_runner_bridge.cjs');

const BACKEND_URL = "ws://127.0.0.1:8765/ws";
let ws = null;
let mainWindow = null;
let isConnected = false;
let reconnectInterval = 5000; // 5 seconds
let isFirstQuery = true; // Track if this is the first user query in the session

function log(message) {
  // Only log important events, not every message
  console.log(`[IPC Bridge] ${message}`);
}

function logDebug(message) {
  // Debug logging - can be enabled for troubleshooting
  // console.log(`[IPC Bridge] ${message}`);
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

    // Send handshake message as required by the backend server
    const handshakeMessage = {
      type: 'handshake',
      user_id: 'default_user',
    };
    try {
      ws.send(JSON.stringify(handshakeMessage));
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
 * @param {string} type - The message type (e.g., 'ping').
 * @param {object} payload - The JSON object payload for the message.
 */
function sendMessageToBackend(type, payload) {
  if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
    log('Cannot send message: WebSocket is not connected.');
    return;
  }

  const message = {
    id: uuidv4(),
    type,
    payload,
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
        const memoryPromise = getMemories(payload.text);  // Start memory search immediately
        const statePromise = getSystemState(contextType); // Start system state immediately (parallel)
        
        // Wait for both to complete - system context is REQUIRED, memories are optional
        const [stateResponse, memoryResponse] = await Promise.allSettled([
          statePromise,   // REQUIRED - must complete
          memoryPromise   // Optional - can fail
        ]);

        // Build message content parts
        const parts = [];

        // 1. System state XML (REQUIRED - must be present)
        let systemStateXml = null;
        if (stateResponse.status === 'fulfilled' && stateResponse.value?.payload?.success && stateResponse.value.payload?.data?.system_state) {
          systemStateXml = stateResponse.value.payload.data.system_state;
          parts.push(systemStateXml.trim());
          log('System state added to message');
        } else {
          // System context is REQUIRED - log error but continue with fallback
          const errorMsg = stateResponse.status === 'rejected' 
            ? stateResponse.reason?.message || 'Unknown error'
            : 'No system state data in response';
          log(`ERROR: System state enrichment failed: ${errorMsg}`);
          // Add minimal fallback system context
          const fallbackTime = new Date().toISOString();
          systemStateXml = `<system_context>\n    <os_state>\n        <active_window>Unknown</active_window>\n        <mouse_position>Unknown</mouse_position>\n        <time>${fallbackTime}</time>\n    </os_state>\n</system_context>`;
          parts.push(systemStateXml);
          log('Using fallback system context');
        }

        // 2. Memory sections
        let memories = null;
        // Response structure: { success: true, payload: { success: true, data: { memories: {...} } } }
        const responsePayload = memoryResponse.status === 'fulfilled' ? memoryResponse.value?.payload : null;
        if (responsePayload?.success && responsePayload?.data?.memories) {
          memories = responsePayload.data.memories;
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
            const payload = memoryResponse.value?.payload;
            log(`Memory response structure: success=${payload?.success}, hasData=${!!payload?.data}, hasMemories=${!!payload?.data?.memories}`);
            if (payload && !payload.data?.memories) {
              log(`Memory payload keys: ${Object.keys(payload).join(', ')}`);
              if (payload.data) {
                log(`Memory data keys: ${Object.keys(payload.data).join(', ')}`);
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
        const fallbackTime = new Date().toISOString();
        const fallbackContext = `<system_context>\n    <os_state>\n        <active_window>Unknown</active_window>\n        <mouse_position>Unknown</mouse_position>\n        <time>${fallbackTime}</time>\n    </os_state>\n</system_context>`;
        payload.content = `${fallbackContext}\n\n<user_query>\n${payload.text}\n</user_query>`;
        log('Using fallback system context in error handler');
      }
    }

    // Extract system context from tool-result messages
    // System state is already included in llm_content by Python sidecar - extract it instead of making duplicate request
    if (type === 'tool-result') {
      try {
        // Extract system state from llm_content (already retrieved by Python sidecar)
        // Python sidecar includes <os_state> XML in the formatted llm_content
        // Structure: payload.data.llm_content contains the formatted string with <os_state>...</os_state>
        let systemStateXml = null;
        
        // Check if llm_content exists in payload.data
        const llmContent = payload?.data?.llm_content;
        if (llmContent && typeof llmContent === 'string') {
          // Extract <os_state> block from llm_content (handles multiline XML)
          const osStateMatch = llmContent.match(/<os_state>([\s\S]*?)<\/os_state>/);
          if (osStateMatch) {
            systemStateXml = `<os_state>${osStateMatch[1]}</os_state>`;
            logDebug('Extracted system state from llm_content');
          }
        }
        
        // If we couldn't extract from llm_content, use fallback
        if (!systemStateXml) {
          const fallbackTime = new Date().toISOString();
          systemStateXml = `<os_state><active_window>Unknown</active_window><mouse_position>Unknown</mouse_position><time>${fallbackTime}</time></os_state>`;
          log('Could not extract system state from llm_content, using fallback');
        }
        
        // Extract active_window, mouse_position, and time from XML
        const activeWindowMatch = systemStateXml.match(/<active_window>(.*?)<\/active_window>/);
        const mousePositionMatch = systemStateXml.match(/<mouse_position>(.*?)<\/mouse_position>/);
        const timeMatch = systemStateXml.match(/<time>(.*?)<\/time>/);
        
        payload.system_context = {
          active_window: activeWindowMatch ? activeWindowMatch[1].trim() : 'Unknown',
          mouse_position: mousePositionMatch ? mousePositionMatch[1].trim() : 'Unknown',
          time: timeMatch ? timeMatch[1].trim() : new Date().toISOString()
        };
        
        logDebug('System context extracted from llm_content and added to tool result');
      } catch (error) {
        log(`ERROR: Failed to extract system context from tool result: ${error.message}`);
        // Always provide fallback system context - never skip it
        const fallbackTime = new Date().toISOString();
        payload.system_context = {
          active_window: 'Unknown',
          mouse_position: 'Unknown',
          time: fallbackTime
        };
        log('Using fallback system context for tool result due to error');
      }
    }

    sendMessageToBackend(type, payload);
  });
}

module.exports = {
  initializeIpc,
  sendMessageToBackend,
};
