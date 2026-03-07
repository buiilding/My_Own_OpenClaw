/**
 * Wakeword Detection Bridge
 * 
 * Manages Python wakeword service subprocess and handles IPC communication
 * between renderer process and Python service.
 */

const { spawn } = require('child_process');
const { app, ipcMain } = require('electron');
const {
  resolveSidecarLaunchTarget,
} = require('./runtime_paths.cjs');
const {
  emitWakewordStatus,
  handleWakewordStderrLine,
  normalizeAudioChunk,
  resolveWakewordProcessErrorMessage,
  resolveWakewordStartErrorMessage,
} = require('./wakeword_bridge_runtime.cjs');

let pythonProcess = null;
let isPythonReady = false;
let stderrBuffer = '';
let wakewordDetectedCallback = null;

/**
 * Start Python wakeword service
 */
function startWakewordService(mainWindow, onWakewordDetected) {
  if (pythonProcess) {
    console.log('[Wakeword] Service already running');
    return;
  }

  const launchTarget = resolveSidecarLaunchTarget('wakeword_service.py');
  const packagedApp = Boolean(app && app.isPackaged);
  stderrBuffer = '';

  const startErrorMessage = resolveWakewordStartErrorMessage({ launchTarget, packagedApp });
  if (startErrorMessage) {
    console.error(`[Wakeword] ${startErrorMessage}`);
    emitWakewordStatus(mainWindow, {
      ready: false,
      error: startErrorMessage,
    });
    return;
  }

  console.log(
    `[Wakeword] Starting service (${launchTarget.kind}): ` +
    `${launchTarget.command} ${launchTarget.args.join(' ')}`.trim(),
  );
  const spawnedProcess = spawn(launchTarget.command, launchTarget.args, {
    stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
    cwd: launchTarget.cwd,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      WINDIE_PACKAGED_APP: packagedApp ? '1' : '0',
      WINDIE_WAKEWORD_ALLOW_RUNTIME_DOWNLOAD: packagedApp ? '0' : '1',
    },
  });
  pythonProcess = spawnedProcess;

  console.log(`[Wakeword] Python process spawned (PID: ${spawnedProcess.pid})`);

  // Handle stderr (status messages)
  // Buffer stderr and only parse complete JSON lines
  spawnedProcess.stderr.on('data', (data) => {
    if (pythonProcess !== spawnedProcess) {
      return;
    }
    const text = data.toString();
    stderrBuffer += text;
    
    // Split by newlines and process complete lines
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      handleWakewordStderrLine({
        line,
        mainWindow,
        getIsPythonReady: () => isPythonReady,
        setIsPythonReady: (nextReady) => {
          isPythonReady = Boolean(nextReady);
        },
      });
    }
  });

  // Handle stdout (detection results only - ready signal now comes via stderr)
  spawnedProcess.stdout.on('data', (data) => {
    if (pythonProcess !== spawnedProcess) {
      return;
    }
    processDetectionResults(data, mainWindow, onWakewordDetected || wakewordDetectedCallback);
  });

  // Handle process exit
  spawnedProcess.on('exit', (code, signal) => {
    if (pythonProcess !== spawnedProcess) {
      return;
    }
    console.log(`[Wakeword] Python process exited - code: ${code}, signal: ${signal}`);
    isPythonReady = false;
    pythonProcess = null;
    stderrBuffer = '';
    clearResultBuffer();
    
    if (code !== 0 && code !== null) {
      let errorMessage = null;
      if (code === 9009 && process.platform === 'win32') {
        errorMessage = 'Python not found. Please install Python or ensure it is in your PATH.';
      } else {
        errorMessage = `Python process exited with code ${code}`;
      }
      
      console.error(`[Wakeword] ${errorMessage}`);
      emitWakewordStatus(mainWindow, { 
        ready: false,
        error: errorMessage
      });
    } else {
      console.log('[Wakeword] Python process exited normally');
      emitWakewordStatus(mainWindow, { ready: false });
    }
  });

  spawnedProcess.on('error', (error) => {
    if (pythonProcess !== spawnedProcess) {
      return;
    }
    console.error(`[Wakeword] Failed to start Python process: ${error.message} (code: ${error.code})`);
    isPythonReady = false;
    pythonProcess = null;
    stderrBuffer = '';
    clearResultBuffer();
    
    const errorMessage = resolveWakewordProcessErrorMessage({ launchTarget, error });
    
    emitWakewordStatus(mainWindow, { 
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

/**
 * Send audio chunk to Python service
 */
function sendAudioChunk(audioData) {
  if (!pythonProcess || !isPythonReady || !isWakewordEnabled) {
    return;
  }

  try {
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
  stderrBuffer = '';
  clearResultBuffer();
}

/**
 * Initialize wakeword bridge IPC handlers
 */
function initializeWakewordBridge(mainWindow, onWakewordDetected) {
  wakewordDetectedCallback = onWakewordDetected;
  // Service is started lazily on explicit wakeword-enable.

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
    const audioBuffer = normalizeAudioChunk(audioData);
    if (!audioBuffer) {
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
      emitWakewordStatus(mainWindow, { ready: true });
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
};
