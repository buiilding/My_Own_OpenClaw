/**
 * Coordinates the wakeword bridge runtime for the Electron main process.
 */

function isDestroyedObjectError(error) {
  return error?.message === 'Object has been destroyed';
}

function canSendToWakewordWindow(mainWindow) {
  try {
    if (!mainWindow || typeof mainWindow !== 'object') {
      return false;
    }
    if (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed()) {
      return false;
    }

    const { webContents } = mainWindow;
    if (!webContents || typeof webContents.send !== 'function') {
      return false;
    }
    if (typeof webContents.isDestroyed === 'function' && webContents.isDestroyed()) {
      return false;
    }

    return true;
  } catch (error) {
    if (isDestroyedObjectError(error)) {
      return false;
    }
    throw error;
  }
}

function emitWakewordEvent(mainWindow, channel, payload) {
  if (!canSendToWakewordWindow(mainWindow)) {
    return false;
  }
  try {
    mainWindow.webContents.send(channel, payload);
    return true;
  } catch (error) {
    if (isDestroyedObjectError(error)) {
      return false;
    }
    throw error;
  }
}

function emitWakewordStatus(mainWindow, payload) {
  return emitWakewordEvent(mainWindow, 'wakeword-status', payload);
}

function shouldSuppressWakewordLogLine(line) {
  return line.includes('terminator_CreateInstance')
    || line.includes('Failed to CreateInstance in ICD');
}

function handleWakewordStderrLine({
  line,
  mainWindow,
  getIsPythonReady,
  setIsPythonReady,
  log = console.log,
  error = console.error,
}) {
  const trimmed = line.trim();
  if (!trimmed || shouldSuppressWakewordLogLine(trimmed)) {
    return;
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const message = JSON.parse(trimmed);
      if (message.status === 'ready') {
        if (!getIsPythonReady()) {
          setIsPythonReady(true);
          emitWakewordStatus(mainWindow, { ready: true });
        }
      } else if (message.status === 'error') {
        error('[Wakeword] Python error:', message.message);
        setIsPythonReady(false, message.message || '');
        emitWakewordStatus(mainWindow, {
          ready: false,
          error: message.message,
        });
      }
      return;
    } catch (_ignoredError) {
      return;
    }
  }

  if (trimmed.includes('[Python]') || trimmed.includes('DETECTED') || trimmed.includes('hey_jarvis')) {
    log(trimmed);
  } else if (trimmed.toLowerCase().includes('error')) {
    error(trimmed);
  }
}

function resolveWakewordStartErrorMessage({ launchTarget, packagedApp, copy = {} }) {
  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return packagedApp
      ? copy.missingPythonRuntime
        || 'Bundled Python runtime not found in app resources. Please reinstall this app.'
      : 'Python executable not found. Please install Python 3 or ensure it is in your PATH.';
  }
  return null;
}

function resolveWakewordProcessErrorMessage({ launchTarget, error }) {
  if (error.code === 'ENOENT') {
    return `Python executable '${launchTarget.command}' not found. Please install Python 3 or ensure it is in your PATH.`;
  }
  return error.message;
}

function normalizeAudioChunk(audioData) {
  if (typeof audioData === 'string') {
    return Buffer.from(audioData, 'base64');
  }
  if (Buffer.isBuffer(audioData)) {
    return audioData;
  }
  if (audioData instanceof ArrayBuffer) {
    return Buffer.from(audioData);
  }
  return null;
}

module.exports = {
  emitWakewordEvent,
  emitWakewordStatus,
  handleWakewordStderrLine,
  normalizeAudioChunk,
  resolveWakewordProcessErrorMessage,
  resolveWakewordStartErrorMessage,
};
