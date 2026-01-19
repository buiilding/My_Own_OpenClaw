/**
 * Memory Service Bridge
 *
 * Manages Python memory service subprocess and handles IPC communication
 * between renderer process and Python memory service.
 * Uses simple JSON request/response protocol (one line per message).
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');
const { v4: uuidv4 } = require('uuid');

let pythonProcess = null;
let isPythonReady = false;
let pendingRequests = new Map();

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
      console.log(`[MemoryService] Using conda Python: ${condaPython}`);
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
 * Start Python memory service
 */
function startMemoryService() {
  if (pythonProcess) {
    console.log('[MemoryService] Python process already running');
    return;
  }

  const pythonPath = getPythonPath();
  const scriptPath = path.join(__dirname, 'python/memory_service.py');

  // Verify script exists
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`[MemoryService] Script not found at: ${scriptPath}`);
    return;
  }

  console.log(`[MemoryService] Starting Python memory service with: ${pythonPath} ${scriptPath}`);

  pythonProcess = spawn(pythonPath, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: path.dirname(scriptPath),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    }
  });

  // Mark as ready immediately after spawn
  isPythonReady = true;

  let stdoutBuffer = '';

  // Handle stdout (JSON responses, one line per message)
  pythonProcess.stdout.on('data', (data) => {
    try {
      stdoutBuffer += data.toString();
      
      // Process complete lines
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            handlePythonResponse(response);
          } catch (error) {
            console.error('[MemoryService] Error parsing response:', error, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('[MemoryService] Error processing stdout:', error);
    }
  });

  // Handle stderr (logs from Python)
  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`[MemoryService Python] ${line}`);
      }
    }
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[MemoryService] Python process exited with code ${code}, signal ${signal}`);
    pythonProcess = null;
    isPythonReady = false;
  });

  // Handle process errors
  pythonProcess.on('error', (error) => {
    console.error('[MemoryService] Failed to start Python process:', error);
    pythonProcess = null;
    isPythonReady = false;
  });
}

/**
 * Handle responses from Python process
 */
function handlePythonResponse(response) {
  const requestId = response.id;
  
  if (requestId && pendingRequests.has(requestId)) {
    const { resolve, reject } = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    
    if (response.success) {
      resolve(response);
    } else {
      reject(new Error(response.error || 'Memory operation failed'));
    }
  } else {
    console.warn('[MemoryService] Received response for unknown request:', requestId);
  }
}

/**
 * Send request to Python process
 */
function sendRequest(type, payload, requestId) {
  if (!pythonProcess || !isPythonReady) {
    throw new Error('Memory service not ready');
  }

  const request = {
    id: requestId,
    type,
    payload,
  };

  try {
    const jsonStr = JSON.stringify(request);
    pythonProcess.stdin.write(jsonStr + '\n');
    return true;
  } catch (error) {
    console.error('[MemoryService] Failed to send request:', error);
    return false;
  }
}

/**
 * Search memories
 */
async function searchMemory(query, user_id = 'default_user', limit = 5, memory_type = null) {
  const requestId = `memory-search-${uuidv4()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Memory search request timed out'));
      }
    }, 15000);

    pendingRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    const sent = sendRequest('search', {
      query,
      user_id,
      limit,
      memory_type,
    }, requestId);

    if (!sent) {
      pendingRequests.delete(requestId);
      clearTimeout(timeout);
      reject(new Error('Failed to send memory search request'));
    }
  });
}

/**
 * Store memory
 */
async function storeMemory(userQuery, assistantResponse, memoryType, userId, sessionId = null) {
  const requestId = `memory-store-${uuidv4()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Memory store request timed out'));
      }
    }, 10000);

    pendingRequests.set(requestId, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    const sent = sendRequest('store', {
      user_query: userQuery,
      assistant_response: assistantResponse,
      memory_type: memoryType,
      user_id: userId,
      session_id: sessionId,
    }, requestId);

    if (!sent) {
      pendingRequests.delete(requestId);
      clearTimeout(timeout);
      reject(new Error('Failed to send memory store request'));
    }
  });
}

/**
 * Stop the Python memory service
 */
function stopMemoryService() {
  if (pythonProcess) {
    console.log('[MemoryService] Stopping Python process...');
    pythonProcess.kill('SIGTERM');

    // Force kill if still running after 5 seconds
    setTimeout(() => {
      if (pythonProcess) {
        console.log('[MemoryService] Force killing Python process');
        pythonProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

/**
 * Initialize IPC handlers for memory service communication
 */
function initializeMemoryServiceBridge() {
  // Start the Python process
  startMemoryService();

  // Handle memory search requests
  ipcMain.handle('search-memory', async (event, { query, user_id, limit, memory_type }) => {
    try {
      const result = await searchMemory(query, user_id, limit, memory_type);
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
      const result = await storeMemory(userQuery, assistantResponse, memoryType, userId, sessionId);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('[MemoryService] Memory service bridge initialized');
}

module.exports = {
  initializeMemoryServiceBridge,
  stopMemoryService,
  searchMemory,
  storeMemory,
};
