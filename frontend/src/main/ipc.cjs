/**
 * IPC Bridge for communication between Electron's main process,
 * renderer process, and the Python backend.
 */

const { ipcMain, BrowserWindow } = require('electron');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const BACKEND_URL = "ws://127.0.0.1:8765/ws";
let ws = null;
let mainWindow = null;
let isConnected = false;
let reconnectInterval = 5000; // 5 seconds

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

  ipcMain.on('to-backend', (event, { type, payload }) => {
    // Only log important message types
    if (type === 'query' || type === 'wakeword-detected') {
      log(`Received ${type} from renderer`);
    }
    sendMessageToBackend(type, payload);
  });
}

module.exports = {
  initializeIpc,
  sendMessageToBackend,
};
