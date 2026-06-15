/**
 * Provides the layer log sink module for the Electron main process.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LOG_DIR = path.join(REPO_ROOT, '.windie', 'logs');
const VALID_LOG_LAYERS = new Set(['frontend', 'vite', 'main', 'renderer', 'sidecar']);
const RENDERER_VERBOSE_LOG_FILE_NAME = 'renderer.verbose.log';
const CONSOLE_STREAM_ERROR_GUARD_INSTALLED = '__windieConsoleStreamErrorGuardInstalled';

function normalizeLayer(layer) {
  const normalized = String(layer || '').trim().toLowerCase();
  if (!VALID_LOG_LAYERS.has(normalized)) {
    throw new Error(`Unknown Windie log layer: ${layer}`);
  }
  return normalized;
}

function envKeyForLayer(layer) {
  return `WINDIE_${normalizeLayer(layer).toUpperCase()}_LOG_FILE`;
}

function resolveLayerLogFile(layer, env = process.env) {
  const normalizedLayer = normalizeLayer(layer);
  const configured = env[envKeyForLayer(normalizedLayer)];
  if (configured === '0' || configured === 'false') {
    return null;
  }
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim();
    return path.isAbsolute(value) ? value : path.join(REPO_ROOT, value);
  }
  return path.join(LOG_DIR, `${normalizedLayer}.log`);
}

function resolveRendererVerboseLogFile(env = process.env) {
  const configured = env.WINDIE_RENDERER_VERBOSE_LOG_FILE;
  if (configured === '0' || configured === 'false') {
    return null;
  }
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim();
    return path.isAbsolute(value) ? value : path.join(REPO_ROOT, value);
  }
  return path.join(LOG_DIR, RENDERER_VERBOSE_LOG_FILE_NAME);
}

function ensureLogFile(logFile, {
  fsImpl = fs,
  initialLines = null,
} = {}) {
  if (!logFile) {
    return null;
  }
  fsImpl.mkdirSync(path.dirname(logFile), { recursive: true });
  if (!fsImpl.existsSync(logFile)) {
    const lines = Array.isArray(initialLines)
      ? initialLines
      : ['[WindieOS] log file initialized.', ''];
    fsImpl.writeFileSync(logFile, lines.join('\n'));
  }
  return logFile;
}

function createLayerLogStream(layer, {
  env = process.env,
  fsImpl = fs,
  now = () => new Date(),
  sessionLabel = null,
} = {}) {
  const normalizedLayer = normalizeLayer(layer);
  const logFile = resolveLayerLogFile(normalizedLayer, env);
  if (!logFile) {
    return null;
  }
  fsImpl.mkdirSync(path.dirname(logFile), { recursive: true });
  const stream = fsImpl.createWriteStream(logFile, { flags: 'a' });
  const label = sessionLabel || `${normalizedLayer} log session`;
  stream.write(`\n[WindieOS] ${label} ${now().toISOString()}\n`);
  stream.on?.('error', (error) => {
    process.stderr.write(`[WindieOS] Failed to write ${normalizedLayer} log: ${error.message}\n`);
  });
  return stream;
}

function normalizeLogText(value) {
  if (typeof value === 'string') {
    return value;
  }
  return util.inspect(value, {
    depth: 5,
    breakLength: 120,
    compact: true,
  });
}

function formatConsoleArgs(args = []) {
  return Array.from(args).map(normalizeLogText).join(' ');
}

function isIgnorableConsoleWriteError(error) {
  const code = error?.code;
  return (
    code === 'EPIPE'
    || code === 'ERR_STREAM_DESTROYED'
    || code === 'ERR_STREAM_WRITE_AFTER_END'
  );
}

function installConsoleStreamErrorGuards({
  processObject = process,
} = {}) {
  const streams = [processObject?.stdout, processObject?.stderr];
  let installed = false;
  streams.forEach((stream) => {
    if (!stream || typeof stream.on !== 'function' || stream[CONSOLE_STREAM_ERROR_GUARD_INSTALLED]) {
      return;
    }
    stream.on('error', (error) => {
      if (!isIgnorableConsoleWriteError(error)) {
        throw error;
      }
    });
    Object.defineProperty(stream, CONSOLE_STREAM_ERROR_GUARD_INSTALLED, {
      value: true,
      enumerable: false,
      configurable: true,
    });
    installed = true;
  });
  return installed;
}

function prefixLayerLine(layer, line, prefix = '') {
  const text = String(line ?? '');
  if (prefix) {
    return `${prefix}${text}`;
  }
  if (layer === 'main' && text.trim() && !text.trimStart().startsWith('[')) {
    return `[Main] ${text}`;
  }
  return text;
}

function appendLayerLogLine(layer, line, {
  env = process.env,
  fsImpl = fs,
  prefix = '',
} = {}) {
  const normalizedLayer = normalizeLayer(layer);
  const logFile = resolveLayerLogFile(normalizedLayer, env);
  if (!logFile) {
    return false;
  }
  fsImpl.mkdirSync(path.dirname(logFile), { recursive: true });
  const lines = String(line ?? '').split(/\r?\n/);
  const writableLines = lines
    .filter((item, index) => item.length > 0 || index < lines.length - 1)
    .map((item) => prefixLayerLine(normalizedLayer, item, prefix));
  if (writableLines.length === 0) {
    return false;
  }
  fsImpl.appendFileSync(logFile, `${writableLines.join('\n')}\n`);
  return true;
}

function appendLogFileLine(logFile, line, {
  fsImpl = fs,
} = {}) {
  if (!logFile) {
    return false;
  }
  fsImpl.mkdirSync(path.dirname(logFile), { recursive: true });
  const lines = String(line ?? '').split(/\r?\n/);
  const writableLines = lines.filter((item, index) => item.length > 0 || index < lines.length - 1);
  if (writableLines.length === 0) {
    return false;
  }
  fsImpl.appendFileSync(logFile, `${writableLines.join('\n')}\n`);
  return true;
}

function appendRendererVerboseLogLine(line, {
  env = process.env,
  fsImpl = fs,
} = {}) {
  return appendLogFileLine(resolveRendererVerboseLogFile(env), line, { fsImpl });
}

function appendLayerLogSessionBanner(layer, {
  env = process.env,
  fsImpl = fs,
  now = () => new Date(),
  sessionLabel = null,
} = {}) {
  const normalizedLayer = normalizeLayer(layer);
  const label = sessionLabel || `${normalizedLayer} log session`;
  return appendLayerLogLine(
    normalizedLayer,
    `\n[WindieOS] ${label} ${now().toISOString()}`,
    { env, fsImpl },
  );
}

function appendRendererVerboseLogSessionBanner({
  env = process.env,
  fsImpl = fs,
  now = () => new Date(),
  sessionLabel = 'renderer verbose console log session',
} = {}) {
  return appendRendererVerboseLogLine(
    `\n[WindieOS] ${sessionLabel} ${now().toISOString()}`,
    { env, fsImpl },
  );
}

function attachLineStream(stream, {
  onLine,
  onChunk = null,
} = {}) {
  if (!stream || typeof stream.on !== 'function') {
    return null;
  }
  let buffered = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    const text = String(chunk ?? '');
    if (typeof onChunk === 'function') {
      onChunk(text);
    }
    buffered += text;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';
    lines.forEach((line) => {
      if (typeof onLine === 'function') {
        onLine(line);
      }
    });
  });
  stream.on('end', () => {
    if (buffered && typeof onLine === 'function') {
      onLine(buffered);
      buffered = '';
    }
  });
  return () => {
    if (buffered && typeof onLine === 'function') {
      onLine(buffered);
      buffered = '';
    }
  };
}

function installConsoleLayerLog({
  layer = 'main',
  consoleObject = console,
  env = process.env,
  methods = ['log', 'info', 'warn', 'error', 'debug'],
  processObject = process,
  sessionLabel = null,
} = {}) {
  const normalizedLayer = normalizeLayer(layer);
  installConsoleStreamErrorGuards({ processObject });
  if (!consoleObject || consoleObject.__windieLayerLogInstalled) {
    return false;
  }
  appendLayerLogSessionBanner(normalizedLayer, {
    env,
    sessionLabel: sessionLabel || `${normalizedLayer} console log session`,
  });
  const originals = {};
  methods.forEach((method) => {
    if (typeof consoleObject[method] !== 'function') {
      return;
    }
    originals[method] = consoleObject[method].bind(consoleObject);
    consoleObject[method] = (...args) => {
      try {
        appendLayerLogLine(normalizedLayer, formatConsoleArgs(args), { env });
      } catch (_error) {
        // Logging must not break the runtime path that emitted the log.
      }
      try {
        originals[method](...args);
      } catch (error) {
        if (!isIgnorableConsoleWriteError(error)) {
          throw error;
        }
      }
    };
  });
  Object.defineProperty(consoleObject, '__windieLayerLogInstalled', {
    value: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(consoleObject, '__windieLayerLogOriginals', {
    value: originals,
    enumerable: false,
    configurable: true,
  });
  return true;
}

module.exports = {
  LOG_DIR,
  REPO_ROOT,
  VALID_LOG_LAYERS,
  appendLayerLogLine,
  appendLayerLogSessionBanner,
  appendRendererVerboseLogLine,
  appendRendererVerboseLogSessionBanner,
  attachLineStream,
  createLayerLogStream,
  ensureLogFile,
  formatConsoleArgs,
  installConsoleLayerLog,
  installConsoleStreamErrorGuards,
  normalizeLayer,
  resolveLayerLogFile,
  resolveRendererVerboseLogFile,
};
