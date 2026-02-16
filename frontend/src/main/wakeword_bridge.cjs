/**
 * Wakeword Detection Bridge
 * 
 * Manages Python wakeword service subprocess and handles IPC communication
 * between renderer process and Python service.
 */

const { spawn } = require('child_process');
const path = require('path');
const { ipcMain } = require('electron');

let pythonProcess = null;
let isPythonReady = false;
let audioQueue = [];
let processingQueue = false;
let stderrBuffer = '';
let wakewordDetectedCallback = null;

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
    // Windows: try py launcher first, then python
    return 'py';
  } else {
    // Unix-like: try python3 first, then python
    return 'python3';
  }
}

/**
 * Start Python wakeword service
 */
function startWakewordService(mainWindow, onWakewordDetected) {
  if (pythonProcess) {
    console.log('[Wakeword] Service already running');
    return;
  }

  const pythonScript = path.join(__dirname, 'python', 'wakeword_service.py');
  const pythonExe = getPythonPath();

  console.log(`[Wakeword] Starting Python service: ${pythonExe} ${pythonScript}`);
  pythonProcess = spawn(pythonExe, [pythonScript], {
    stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
    cwd: __dirname,
  });

  console.log(`[Wakeword] Python process spawned (PID: ${pythonProcess.pid})`);

  // Handle stderr (status messages)
  // Buffer stderr and only parse complete JSON lines
  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    stderrBuffer += text;
    
    // Split by newlines and process complete lines
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Filter out harmless graphics driver warnings
      if (trimmed.includes('terminator_CreateInstance') || 
          trimmed.includes('Failed to CreateInstance in ICD')) {
        // Suppress this harmless warning
        continue;
      }
      
      // Only try to parse lines that look like JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const message = JSON.parse(trimmed);
          if (message.status === 'ready') {
            if (!isPythonReady) {
              isPythonReady = true;
              mainWindow?.webContents.send('wakeword-status', { ready: true });
            }
          } else if (message.status === 'error') {
            console.error('[Wakeword] Python error:', message.message);
            isPythonReady = false;
            mainWindow?.webContents.send('wakeword-status', { 
              ready: false, 
              error: message.message 
            });
          }
        } catch (e) {
          // Silently ignore JSON parse errors for non-JSON lines
        }
      } else {
        // Display Python logs (confidence scores, detections, etc.)
        if (trimmed.includes('[Python]') || trimmed.includes('DETECTED') || trimmed.includes('hey_jarvis')) {
          console.log(trimmed);
        } else if (trimmed.toLowerCase().includes('error')) {
          console.error(trimmed);
        }
        // Ignore other messages (warnings, etc.)
      }
    }
  });

  // Handle stdout (detection results only - ready signal now comes via stderr)
  pythonProcess.stdout.on('data', (data) => {
    processDetectionResults(data, mainWindow, onWakewordDetected || wakewordDetectedCallback);
  });

  // Handle process exit
  pythonProcess.on('exit', (code, signal) => {
    console.log(`[Wakeword] Python process exited - code: ${code}, signal: ${signal}`);
    isPythonReady = false;
    pythonProcess = null;
    stderrBuffer = '';
    
    if (code !== 0 && code !== null) {
      let errorMessage = null;
      if (code === 9009 && process.platform === 'win32') {
        errorMessage = 'Python not found. Please install Python or ensure it is in your PATH.';
      } else {
        errorMessage = `Python process exited with code ${code}`;
      }
      
      console.error(`[Wakeword] ${errorMessage}`);
      mainWindow?.webContents.send('wakeword-status', { 
        ready: false,
        error: errorMessage
      });
    } else {
      console.log('[Wakeword] Python process exited normally');
      mainWindow?.webContents.send('wakeword-status', { ready: false });
    }
  });

  pythonProcess.on('error', (error) => {
    console.error(`[Wakeword] Failed to start Python process: ${error.message} (code: ${error.code})`);
    isPythonReady = false;
    pythonProcess = null;
    stderrBuffer = '';
    
    let errorMessage = error.message;
    if (error.code === 'ENOENT') {
      errorMessage = `Python executable '${pythonExe}' not found. Please install Python 3 or ensure it is in your PATH.`;
    }
    
    mainWindow?.webContents.send('wakeword-status', { 
      ready: false, 
      error: errorMessage 
    });
  });
}

/**
 * Process detection results from Python service
 */
let resultBuffer = Buffer.alloc(0);
let isWakewordEnabled = true; // Track if wakeword detection is enabled

/**
 * Clear/flush the result buffer to discard any pending detection results
 */
function clearResultBuffer() {
  resultBuffer = Buffer.alloc(0);
}

function processDetectionResults(data, mainWindow, onWakewordDetected) {
  // Ignore detection results if wakeword is disabled
  if (!isWakewordEnabled) {
    return;
  }

  resultBuffer = Buffer.concat([resultBuffer, data]);

  while (resultBuffer.length >= 4) {
    // Read message length
    const length = resultBuffer.readUInt32LE(0);
    
    if (resultBuffer.length < 4 + length) {
      // Not enough data yet
      break;
    }

    // Extract JSON message
    const jsonData = resultBuffer.slice(4, 4 + length);
    resultBuffer = resultBuffer.slice(4 + length);

    try {
      const result = JSON.parse(jsonData.toString('utf-8'));
      
      // Double-check wakeword is still enabled before processing detection
      if (result.detected && isWakewordEnabled) {
        console.log(`[Wakeword] *** DETECTED *** ${result.model} (confidence: ${result.confidence}, score: ${result.score})`);
        if (typeof onWakewordDetected === 'function') {
          try {
            onWakewordDetected();
          } catch (error) {
            console.error('[Wakeword] Wakeword handler failed:', error);
          }
        }
        mainWindow?.webContents.send('wakeword-detected', {
          model: result.model,
          confidence: result.confidence,
          score: result.score,
        });
        // Clear buffer after sending detection to prevent processing duplicate/buffered detections
        clearResultBuffer();
      } else if (result.error) {
        console.error('[Wakeword] Python service error:', result.error);
      }
      // Note: Python service logs all scores via stderr, so we don't duplicate here
    } catch (e) {
      console.error('[Wakeword] Error parsing detection result:', e);
    }
  }
}

let sentChunkCount = 0;
/**
 * Send audio chunk to Python service
 */
function sendAudioChunk(audioData) {
  if (!pythonProcess || !isPythonReady || !isWakewordEnabled) {
    return;
  }

  try {
    sentChunkCount++;
    
    // Send length (4 bytes) + audio data
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(audioData.length, 0);
    
    pythonProcess.stdin.write(lengthBuffer);
    pythonProcess.stdin.write(audioData);
  } catch (error) {
    console.error('[Wakeword] Error sending audio chunk:', error);
  }
}

/**
 * Stop Python wakeword service
 */
function stopWakewordService() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
    isPythonReady = false;
  }
}

/**
 * Initialize wakeword bridge IPC handlers
 */
function initializeWakewordBridge(mainWindow, onWakewordDetected) {
  wakewordDetectedCallback = onWakewordDetected;
  // Start service when bridge is initialized
  startWakewordService(mainWindow, onWakewordDetected);

  let receivedChunkCount = 0;
  // Handle audio chunks from renderer
  ipcMain.on('wakeword-audio-chunk', (event, audioData) => {
    if (!isPythonReady) {
      if (receivedChunkCount === 0) {
        console.log('[Wakeword] Audio chunks received but Python service not ready yet');
      }
      return;
    }
    
    if (!audioData) {
      console.error('[Wakeword] Received null/undefined audio data');
      return;
    }
    
    receivedChunkCount++;
    
    // Convert base64 or buffer to Buffer
    let audioBuffer;
    if (typeof audioData === 'string') {
      audioBuffer = Buffer.from(audioData, 'base64');
    } else if (Buffer.isBuffer(audioData)) {
      audioBuffer = audioData;
    } else if (audioData instanceof ArrayBuffer) {
      audioBuffer = Buffer.from(audioData);
    } else {
      console.error('[Wakeword] Invalid audio data format:', typeof audioData);
      return;
    }
    
    sendAudioChunk(audioBuffer);
  });

  // Handle enable/disable wakeword detection
  ipcMain.on('wakeword-enable', () => {
    isWakewordEnabled = true;
    if (!pythonProcess) {
      console.log('[Wakeword] Starting Python service...');
      startWakewordService(mainWindow, wakewordDetectedCallback);
    } else if (isPythonReady) {
      // Service already ready, send status immediately (silently, renderer will handle it)
      mainWindow?.webContents.send('wakeword-status', { ready: true });
    }
    // If service is starting, status will be sent when ready - no need to log
  });

  ipcMain.on('wakeword-disable', () => {
    // Disable wakeword detection and clear buffers
    // This prevents old buffered chunks from triggering false detections
    isWakewordEnabled = false;
    console.log('[Wakeword] Disabled - clearing buffers and ignoring detections');
    clearResultBuffer();
    
    // Send reset signal to Python process (length 0)
    if (pythonProcess && pythonProcess.stdin.writable) {
      const emptyBuffer = Buffer.alloc(4);
      emptyBuffer.writeUInt32LE(0, 0);
      pythonProcess.stdin.write(emptyBuffer);
    }
  });

  // Cleanup on app quit
  process.on('beforeExit', () => {
    stopWakewordService();
  });
}

module.exports = {
  initializeWakewordBridge,
  startWakewordService,
  stopWakewordService,
};
