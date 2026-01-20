/**
 * Local Backend Bridge - Electron IPC bridge for Python local backend
 * 
 * Spawns Python local backend subprocess and handles JSON-RPC protocol
 * communication between Electron main process and Python backend.
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();
let stdoutBuffer = '';

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
      return condaPython;
    }
  }
  
  // Try common Python paths
  if (process.platform === 'win32') {
    return 'py';
  } else {
    return 'python3';
  }
}

/**
 * Start Python local backend service
 */
function startLocalBackend(mainWindow) {
  if (pythonProcess) {
    console.log('[LocalBackend] Service already running');
    return;
  }

  const pythonPath = getPythonPath();
  const scriptPath = path.join(__dirname, 'python', 'local_backend.py');

  // Verify script exists
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`[LocalBackend] Script not found at: ${scriptPath}`);
    mainWindow?.webContents.send('local-backend-status', { 
      ready: false, 
      error: `Local backend script not found: ${scriptPath}` 
    });
    return;
  }

  console.log(`[LocalBackend] Starting Python local backend: ${pythonPath} ${scriptPath}`);

  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    }
  });

  // Mark as ready after a short delay (give Python time to initialize)
  setTimeout(() => {
    isPythonReady = true;
    console.log('[LocalBackend] Python service ready');
    mainWindow?.webContents.send('local-backend-status', { ready: true });
  }, 1000);

  let stdoutBuffer = '';

  // Handle stdout (JSON-RPC responses, one line per message)
  pythonProcess.stdout.on('data', (data) => {
    try {
      stdoutBuffer += data.toString();
      
      // Process complete lines
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            handlePythonResponse(response);
          } catch (error) {
            console.error('[LocalBackend] Error parsing response:', error, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('[LocalBackend] Error processing stdout:', error);
    }
  });

  // Handle stderr (logs from Python)
  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[LocalBackend Python] ${line}`);
      }
    }
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[LocalBackend] Python process exited with code ${code}, signal ${signal}`);
    pythonProcess = null;
    isPythonReady = false;
    pendingRequests.clear();
    stdoutBuffer = '';
    
    if (code !== 0 && code !== null) {
      mainWindow?.webContents.send('local-backend-status', { 
        ready: false,
        error: `Python process exited with code ${code}`
      });
    }
  });

  // Handle process errors
  pythonProcess.on('error', (error) => {
    console.error('[LocalBackend] Failed to start Python process:', error);
    pythonProcess = null;
    isPythonReady = false;
    pendingRequests.clear();
    stdoutBuffer = '';
    
    let errorMessage = error.message;
    if (error.code === 'ENOENT') {
      errorMessage = `Python executable '${pythonPath}' not found. Please install Python 3 or ensure it is in your PATH.`;
    }
    
    mainWindow?.webContents.send('local-backend-status', { 
      ready: false, 
      error: errorMessage 
    });
  });
}

/**
 * Handle responses from Python process
 */
function handlePythonResponse(response) {
  const requestId = response.id;
  
  if (requestId && pendingRequests.has(requestId)) {
    const { resolve, reject, timeout } = pendingRequests.get(requestId);
    clearTimeout(timeout);
    pendingRequests.delete(requestId);
    
    if (response.error) {
      reject(new Error(response.error.message || 'JSON-RPC error'));
    } else {
      resolve(response.result);
    }
  } else {
    console.warn('[LocalBackend] Received response for unknown request:', requestId);
  }
}

/**
 * Send JSON-RPC request to Python process
 */
function sendRequest(method, params = {}) {
  if (!pythonProcess || !isPythonReady) {
    throw new Error('Local backend not ready');
  }

  const requestId = uuidv4();
  const request = {
    jsonrpc: '2.0',
    id: requestId,
    method: method,
    params: params,
  };

  return new Promise((resolve, reject) => {
    // Set timeout (30 seconds)
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }
    }, 30000);

    pendingRequests.set(requestId, { resolve, reject, timeout });

    try {
      const jsonStr = JSON.stringify(request);
      pythonProcess.stdin.write(jsonStr + '\n');
    } catch (error) {
      clearTimeout(timeout);
      pendingRequests.delete(requestId);
      reject(error);
    }
  });
}

/**
 * Stop the Python local backend service
 */
function stopLocalBackend() {
  if (pythonProcess) {
    console.log('[LocalBackend] Stopping Python process...');
    pythonProcess.kill('SIGTERM');

    // Force kill if still running after 5 seconds
    setTimeout(() => {
      if (pythonProcess) {
        console.log('[LocalBackend] Force killing Python process');
        pythonProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Initialize IPC handlers for local backend communication
 */
function initializeLocalBackendBridge(mainWindow) {
  // Start the Python process
  startLocalBackend(mainWindow);

  // Handle tool execution requests
  ipcMain.handle('execute-tool', async (event, { toolName, args, skipAutoCapture = false }) => {
    try {
      const result = await sendRequest('execute_tool', {
        tool_name: toolName,
        args: args,
      });
      
      // Convert Python result format to expected format
      if (result.success === false) {
        return { success: false, error: result.error };
      }
      
      return {
        success: true,
        data: result.data || result,
      };
    } catch (error) {
      console.error(`[LocalBackend] Tool execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle system state requests
  ipcMain.handle('get-system-state', async () => {
    try {
      const result = await sendRequest('get_system_state');
      
      if (result.success === false) {
        return null;
      }
      
      return result.data || result;
    } catch (error) {
      console.error(`[LocalBackend] System state request failed: ${error.message}`);
      return null;
    }
  });

  // Handle memory search requests (integrated into local backend)
  ipcMain.handle('search-memory', async (event, { query, user_id, limit, memory_type }) => {
    try {
      const result = await sendRequest('search_memory', {
        query: query,
        user_id: user_id,
        limit: limit,
        memory_type: memory_type,
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle memory storage requests
  ipcMain.handle('store-memory', async (event, { userQuery, assistantResponse, memoryType, userId, sessionId }) => {
    try {
      const result = await sendRequest('store_memory', {
        user_query: userQuery,
        assistant_response: assistantResponse,
        memory_type: memoryType,
        user_id: userId,
        session_id: sessionId,
      });
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('[LocalBackend] Local backend bridge initialized');
}

/**
 * Helper function to get system state (for use in ipc.cjs)
 */
async function getSystemState() {
  try {
    const result = await sendRequest('get_system_state');
    if (result.success === false) {
      return null;
    }
    return result.data || result;
  } catch (error) {
    console.error(`[LocalBackend] System state request failed: ${error.message}`);
    return null;
  }
}

/**
 * Helper function to search memory (for use in ipc.cjs)
 */
async function searchMemory(query, user_id, limit, memory_type) {
  try {
    const result = await sendRequest('search_memory', {
      query: query,
      user_id: user_id,
      limit: limit,
      memory_type: memory_type,
    });
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  initializeLocalBackendBridge,
  stopLocalBackend,
  getSystemState,
  searchMemory,
};
