/**
 * Memory Service Bridge
 *
 * Manages Python memory service subprocess and handles IPC communication
 * between renderer process and Python memory service.
 * Uses simple JSON request/response protocol (one line per message).
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain, app } = require('electron');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const fs = require('fs');

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
 * Normalize user_id to ensure it's valid (not 'default_user', not empty, not whitespace-only).
 * If invalid, generates a persistent user_id based on OS username and hostname.
 * 
 * @param {string} user_id - User ID to normalize
 * @returns {string} Valid user_id
 */
function normalizeUserId(user_id) {
  // If user_id is valid, return it
  if (user_id && user_id.trim() && user_id !== 'default_user') {
    return user_id.trim();
  }
  
  // Generate persistent user_id (same logic as ipc.cjs)
  const userDataPath = app.getPath('userData');
  const userIdFile = path.join(userDataPath, 'user_id.json');
  
  try {
    // Try to load existing user_id
    if (fs.existsSync(userIdFile)) {
      const data = JSON.parse(fs.readFileSync(userIdFile, 'utf8'));
      if (data.user_id && data.user_id.trim() && data.user_id !== 'default_user') {
        return data.user_id.trim();
      }
    }
  } catch (error) {
    console.log(`[MemoryService] Failed to load user_id from file: ${error.message}`);
  }
  
  // Generate new user_id from OS username and hostname
  const username = os.userInfo().username || 'user';
  const hostname = os.hostname() || 'host';
  let generatedId = `${username}_${hostname}`.toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Ensure it's not 'default_user' or empty
  if (!generatedId || generatedId === 'default_user') {
    generatedId = `user_${Date.now()}`;
  }
  
  // Store for persistence
  try {
    fs.writeFileSync(userIdFile, JSON.stringify({ user_id: generatedId }, null, 2), 'utf8');
  } catch (error) {
    console.log(`[MemoryService] Failed to save user_id to file: ${error.message}`);
  }
  
  return generatedId;
}

/**
 * Search memories
 */
async function searchMemory(query, user_id, limit = 5, memory_type = null) {
  // Normalize user_id to ensure it's valid
  const validUserId = normalizeUserId(user_id);
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
      user_id: validUserId,
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
      // Normalize user_id to ensure it's valid
      const validUserId = normalizeUserId(user_id);
      const result = await searchMemory(query, validUserId, limit, memory_type);
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
