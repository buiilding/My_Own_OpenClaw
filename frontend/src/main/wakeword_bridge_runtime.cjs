function emitWakewordStatus(mainWindow, payload) {
  mainWindow?.webContents.send('wakeword-status', payload);
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
        setIsPythonReady(false);
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

function resolveWakewordStartErrorMessage({ launchTarget, packagedApp }) {
  if (launchTarget.kind === 'python' && !launchTarget.command) {
    return packagedApp
      ? 'Bundled Python runtime not found in app resources. Please reinstall WindieOS.'
      : 'Python executable not found. Please install Python 3 or ensure it is in your PATH.';
  }
  return null;
}

function resolveWakewordProcessErrorMessage({ launchTarget, error }) {
  if (error.code === 'ENOENT') {
    return launchTarget.kind === 'binary'
      ? `Bundled wakeword executable '${launchTarget.command}' not found. Reinstall WindieOS.`
      : `Python executable '${launchTarget.command}' not found. Please install Python 3 or ensure it is in your PATH.`;
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
  emitWakewordStatus,
  handleWakewordStderrLine,
  normalizeAudioChunk,
  resolveWakewordProcessErrorMessage,
  resolveWakewordStartErrorMessage,
};
