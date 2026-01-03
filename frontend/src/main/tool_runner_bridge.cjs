/**
 * Tool Runner Bridge
 *
 * Manages Python tool runner subprocess and handles IPC communication
 * between renderer process and Python tool execution service.
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');

let pythonProcess = null;
let isPythonReady = false;
let messageQueue = [];
let processingQueue = false;
let stderrBuffer = '';
let stdoutBuffer = Buffer.alloc(0); // Accumulate stdout data for binary protocol

// Map to track pending requests and their resolvers
const pendingRequests = new Map();

/**
 * Get Python executable path
 */
function getPythonPath() {
  const fs = require('fs');

  // Check conda environment first (common on Windows)
  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPython = process.platform === 'win32'
      ? path.join(condaPrefix, 'python.exe')
      : path.join(condaPrefix, 'bin', 'python3');

    if (fs.existsSync(condaPython)) {
      console.log(`[ToolRunner] Using conda Python: ${condaPython}`);
      return condaPython;
    } else {
      console.log(`[ToolRunner] Conda Python not found at ${condaPython}, trying fallback`);
    }
  }

  // Try common Python paths
  if (process.platform === 'win32') {
    // Windows: try py launcher first, then python
    return 'py';
  } else {
    // Unix-like: try python3 first, then python
    console.log('[ToolRunner] Using system python3');
    return 'python3';
  }
}

/**
 * Start Python tool runner service
 */
function startToolRunner(mainWindow) {
  if (pythonProcess) {
    console.log('[ToolRunner] Python process already running');
    return;
  }

  const pythonPath = getPythonPath();
  const scriptPath = path.join(__dirname, 'python/runner.py');

  // Verify script exists
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`[ToolRunner] Script not found at: ${scriptPath}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool-runner-status', { 
        ready: false, 
        error: `Script not found: ${scriptPath}` 
      });
    }
    return;
  }

  console.log(`[ToolRunner] Starting Python tool runner with: ${pythonPath} ${scriptPath}`);

  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1', // Ensure Python output is unbuffered
    }
  });

  // Mark as ready immediately after spawn (stdin will buffer if python is slow to start)
  isPythonReady = true;

  // Handle stdout (binary protocol with length-prefixed JSON messages from Python)
  pythonProcess.stdout.on('data', (data) => {
    try {
      // Accumulate data in buffer
      stdoutBuffer = Buffer.concat([stdoutBuffer, data]);
      
      // Try to parse complete messages
      const messages = parseStdoutData();
      messages.forEach(message => handlePythonMessage(message, mainWindow));
    } catch (error) {
      console.error('[ToolRunner] Error parsing stdout:', error);
    }
  });

  // Handle stderr (logs from Python)
  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuffer += text;

    // Process complete lines
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop(); // Keep incomplete line

    lines.forEach(line => {
      if (line.trim()) {
        // Filter out harmless graphics driver warnings
        if (line.includes('terminator_CreateInstance') || 
            line.includes('Failed to CreateInstance in ICD')) {
          // Suppress this harmless warning
          return;
        }
        console.log(`[ToolRunner Python] ${line}`);
      }
    });
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[ToolRunner] Python process exited with code ${code}, signal ${signal}`);
    pythonProcess = null;
    isPythonReady = false;
    stdoutBuffer = Buffer.alloc(0); // Reset buffer

    // Notify renderer that tool runner is unavailable
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool-runner-status', { ready: false, error: 'Process exited' });
    }
  });

  // Handle process errors
  pythonProcess.on('error', (error) => {
    console.error('[ToolRunner] Failed to start Python process:', error);
    console.error(`[ToolRunner] Python path attempted: ${pythonPath}`);
    console.error(`[ToolRunner] Script path: ${scriptPath}`);
    console.error(`[ToolRunner] Error details:`, error);
    pythonProcess = null;
    isPythonReady = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool-runner-status', { 
        ready: false, 
        error: `Failed to start: ${error.message}. Python: ${pythonPath}, Script: ${scriptPath}` 
      });
    }
  });
}

/**
 * Parse stdout buffer into complete messages
 * Uses global stdoutBuffer and removes processed data from it
 */
function parseStdoutData() {
  const messages = [];

  // Process messages with length prefix (4 bytes little-endian)
  while (stdoutBuffer.length >= 4) {
    // Read length prefix
    const length = stdoutBuffer.readUInt32LE(0);
    
    // Check if we have complete message
    if (stdoutBuffer.length < 4 + length) {
      break; // Not enough data for complete message, wait for more
    }

    // Extract message data (skip 4-byte length prefix)
    const messageData = stdoutBuffer.slice(4, 4 + length);
    
    // Remove processed data from buffer
    stdoutBuffer = stdoutBuffer.slice(4 + length);

    try {
      // Parse JSON message
      const message = JSON.parse(messageData.toString('utf8'));
      messages.push(message);
    } catch (error) {
      console.error('[ToolRunner] Failed to parse message:', error, 'Data length:', messageData.length);
    }
  }

  return messages;
}

/**
 * Handle messages from Python process
 */
function handlePythonMessage(message, mainWindow) {
  // Use a more descriptive log for internal debugging if needed
  // console.log(`[ToolRunner] Received message: ${message.type} (${message.id})`);

  // 1. Resolve pending internal promise-based requests
  // These are requests like system state, memory search, or initialization
  // that were initiated from the main process.
  if (message.id && pendingRequests.has(message.id)) {
    const { resolve } = pendingRequests.get(message.id);
    pendingRequests.delete(message.id);
    resolve(message);
    
    // CRITICAL: We MUST return here to prevent these internal results 
    // from being forwarded to the UI as "unknown" tool results.
    return;
  }

  // 2. Filter out known internal system messages by ID or content
  // 'init' is our standard initialization ID
  // 'system' is used by runner.py for spontaneous ready/shutdown signals
  const isInternalId = message.id === 'init' || message.id === 'system';
  const isReadySignal = message.payload && (message.payload.status === 'ready' || message.payload.status === 'initialized');
  
  if (isInternalId || isReadySignal) {
    // console.log(`[ToolRunner] Filtering internal system message: ${message.id}`);
    return;
  }

  // 3. Only forward actual tool execution results to the renderer
  // These results are triggered by the renderer via 'execute-tool' and do NOT 
  // exist in our main-process pendingRequests map.
  if (message.type === 'response') {
    // Forward tool execution result to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool-result', message);
    }
  } else if (message.type === 'error') {
    console.error('[ToolRunner] Python error:', message.payload.error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tool-error', message);
    }
  } else {
    console.log('[ToolRunner] Unhandled message type:', message.type);
  }
}

/**
 * Send tool execution request to Python process
 */
function sendToolRequest(toolName, args, requestId) {
  if (!pythonProcess || !isPythonReady) {
    console.error('[ToolRunner] Python process not ready');
    return false;
  }

  const message = {
    id: requestId,
    type: 'request',
    payload: {
      tool: toolName,
      args: args
    }
  };

  try {
    // Send message with length prefix
    const jsonStr = JSON.stringify(message);
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    const lengthBytes = Buffer.alloc(4);
    lengthBytes.writeUInt32LE(jsonBytes.length, 0);

    pythonProcess.stdin.write(lengthBytes);
    pythonProcess.stdin.write(jsonBytes);

    console.log(`[ToolRunner] Sent tool request: ${toolName} (${requestId})`);
    return true;
  } catch (error) {
    console.error('[ToolRunner] Failed to send tool request:', error);
    return false;
  }
}

/**
 * Send system state request to Python process
 */
function sendSystemStateRequest(contextType, requestId) {
  if (!pythonProcess || !isPythonReady) {
    console.error('[ToolRunner] Python process not ready');
    return false;
  }

  const message = {
    id: requestId,
    type: 'system_state_request',
    payload: {
      context_type: contextType
    }
  };

  try {
    const jsonStr = JSON.stringify(message);
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    const lengthBytes = Buffer.alloc(4);
    lengthBytes.writeUInt32LE(jsonBytes.length, 0);

    pythonProcess.stdin.write(lengthBytes);
    pythonProcess.stdin.write(jsonBytes);

    console.log(`[ToolRunner] Sent system state request: ${contextType} (${requestId})`);
    return true;
  } catch (error) {
    console.error('[ToolRunner] Failed to send system state request:', error);
    return false;
  }
}

/**
 * Get system state (initial or full)
 */
async function getSystemState(contextType) {
  const id = `state-${uuidv4()}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('System state request timed out'));
      }
    }, 10000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    const sent = sendSystemStateRequest(contextType, id);
    if (!sent) {
      pendingRequests.delete(id);
      clearTimeout(timeout);
      reject(new Error('Failed to send system state request'));
    }
  });
}

/**
 * Send memory search request to Python process
 */
function sendMemorySearchRequest(query, requestId, limit = 5) {
  if (!pythonProcess || !isPythonReady) {
    console.error('[ToolRunner] Python process not ready');
    return false;
  }

  const message = {
    id: requestId,
    type: 'memory_search_request',
    payload: {
      query,
      limit
    }
  };

  try {
    const jsonStr = JSON.stringify(message);
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    const lengthBytes = Buffer.alloc(4);
    lengthBytes.writeUInt32LE(jsonBytes.length, 0);

    pythonProcess.stdin.write(lengthBytes);
    pythonProcess.stdin.write(jsonBytes);

    console.log(`[ToolRunner] Sent memory search request: ${query} (${requestId})`);
    return true;
  } catch (error) {
    console.error('[ToolRunner] Failed to send memory search request:', error);
    return false;
  }
}

/**
 * Send memory store request to Python process
 */
function sendMemoryStoreRequest(userQuery, assistantResponse, memoryType, userId, requestId, sessionId = null) {
  if (!pythonProcess || !isPythonReady) {
    console.error('[ToolRunner] Python process not ready');
    return false;
  }

  const message = {
    id: requestId,
    type: 'memory_store_request',
    payload: {
      user_query: userQuery,
      assistant_response: assistantResponse,
      memory_type: memoryType,
      user_id: userId,
      session_id: sessionId
    }
  };

  try {
    const jsonStr = JSON.stringify(message);
    const jsonBytes = Buffer.from(jsonStr, 'utf8');
    const lengthBytes = Buffer.alloc(4);
    lengthBytes.writeUInt32LE(jsonBytes.length, 0);

    pythonProcess.stdin.write(lengthBytes);
    pythonProcess.stdin.write(jsonBytes);

    console.log(`[ToolRunner] Sent memory store request: ${memoryType} (${requestId})`);
    return true;
  } catch (error) {
    console.error('[ToolRunner] Failed to send memory store request:', error);
    return false;
  }
}

/**
 * Get memories for a query
 */
async function getMemories(query, limit = 5) {
  const id = `memory-${uuidv4()}`;
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Memory search request timed out'));
      }
    }, 15000);

    pendingRequests.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    const sent = sendMemorySearchRequest(query, id, limit);
    if (!sent) {
      pendingRequests.delete(id);
      clearTimeout(timeout);
      reject(new Error('Failed to send memory search request'));
    }
  });
}

/**
 * Stop the Python tool runner
 */
function stopToolRunner() {
  if (pythonProcess) {
    console.log('[ToolRunner] Stopping Python process...');

    // Send shutdown message if possible
    try {
      const shutdownMessage = {
        id: 'shutdown',
        type: 'shutdown',
        payload: {}
      };
      const jsonStr = JSON.stringify(shutdownMessage);
      const jsonBytes = Buffer.from(jsonStr, 'utf8');
      const lengthBytes = Buffer.alloc(4);
      lengthBytes.writeUInt32LE(jsonBytes.length, 0);

      pythonProcess.stdin.write(lengthBytes);
      pythonProcess.stdin.write(jsonBytes);
    } catch (error) {
      console.log('[ToolRunner] Could not send shutdown message:', error.message);
    }

    // Force kill after a short delay
    setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGTERM');

        // Force kill if still running after 5 seconds
        setTimeout(() => {
          if (pythonProcess) {
            console.log('[ToolRunner] Force killing Python process');
            pythonProcess.kill('SIGKILL');
          }
        }, 5000);
      }
    }, 1000);
  }
}

/**
 * Initialize IPC handlers for tool runner communication
 */
function initializeToolRunnerBridge(mainWindow) {
  // Start the Python process
  startToolRunner(mainWindow);

  // Handle tool execution requests from renderer
  ipcMain.handle('execute-tool', async (event, { toolName, args, requestId }) => {
    console.log(`[ToolRunner] Tool execution request: ${toolName}`, args);

    if (!isPythonReady) {
      return {
        success: false,
        error: 'Tool runner not ready',
        requestId
      };
    }

    const sent = sendToolRequest(toolName, args, requestId);
    if (!sent) {
      return {
        success: false,
        error: 'Failed to send tool request',
        requestId
      };
    }

    // Return immediately - results will come via events
    return { success: true, requestId };
  });

  // Handle tool runner status requests
  ipcMain.handle('tool-runner-status', () => {
    return {
      ready: isPythonReady,
      processRunning: pythonProcess !== null
    };
  });

  // Handle memory storage requests
  ipcMain.handle('store-memory', async (event, { userQuery, assistantResponse, memoryType, userId, sessionId }) => {
    const id = `memory-store-${uuidv4()}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Memory store request timed out'));
        }
      }, 10000);

      pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      const sent = sendMemoryStoreRequest(userQuery, assistantResponse, memoryType, userId, id, sessionId);
      if (!sent) {
        pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new Error('Failed to send memory store request'));
      }
    });
  });

  // Handle system state requests
  ipcMain.handle('get-system-state', async (event, { contextType, requestId }) => {
    const id = requestId || `state-${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('System state request timed out'));
        }
      }, 10000);

      pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      const sent = sendSystemStateRequest(contextType, id);
      if (!sent) {
        pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new Error('Failed to send system state request'));
      }
    });
  });

  console.log('[ToolRunner] Tool runner bridge initialized');
}

module.exports = {
  initializeToolRunnerBridge,
  stopToolRunner,
  getSystemState,
  getMemories,
  sendMemoryStoreRequest
};
