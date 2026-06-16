/**
 * Coordinates the main window overlay runtime for the Electron main process.
 */

const {
  buildPreloadIpcChannelsArgument,
} = require('../ipc/ipc_channel_registry_runtime.cjs');
const {
  appendLayerLogLine,
  appendLayerLogSessionBanner,
  appendRendererVerboseLogLine,
  appendRendererVerboseLogSessionBanner,
} = require('../logging/layer_log_sink.cjs');

function normalizeConsoleMessagePayload(args) {
  if (
    args.length === 2
    && args[1]
    && typeof args[1] === 'object'
    && !Array.isArray(args[1])
  ) {
    const details = args[1];
    return {
      level: details.level,
      message: details.message,
      line: details.lineNumber,
      sourceId: details.sourceId,
    };
  }
  return {
    level: args[1],
    message: args[2],
    line: args[3],
    sourceId: args[4],
  };
}

function isWarningOrErrorConsoleLevel(level) {
  if (typeof level === 'number') {
    return level >= 2;
  }
  const normalized = String(level ?? '').trim().toLowerCase();
  return normalized === 'warning'
    || normalized === 'warn'
    || normalized === 'error'
    || normalized === 'critical';
}

function formatRendererConsoleLogLine({ view, level, message, sourceId, line }) {
  const source = typeof sourceId === 'string' && sourceId
    ? ` ${sourceId}${line ? `:${line}` : ''}`
    : '';
  return `[Renderer][${view}][console:${String(level ?? 'log')}] ${String(message ?? '')}${source}`;
}

function attachRendererConsoleLogging({
  targetWindow,
  view = 'unknown',
  writeLayerLogLine = appendLayerLogLine,
  writeSessionBanner = appendLayerLogSessionBanner,
  writeVerboseLogLine = appendRendererVerboseLogLine,
  writeVerboseSessionBanner = appendRendererVerboseLogSessionBanner,
} = {}) {
  const webContents = targetWindow?.webContents;
  if (!webContents || typeof webContents.on !== 'function') {
    return false;
  }
  if (webContents.__windieRendererConsoleLoggingAttached) {
    return false;
  }
  writeSessionBanner('renderer', {
    sessionLabel: `${view} renderer console log session`,
  });
  writeVerboseSessionBanner({
    sessionLabel: `${view} renderer verbose console log session`,
  });
  webContents.on('console-message', (...args) => {
    const details = normalizeConsoleMessagePayload(args);
    const line = formatRendererConsoleLogLine({
      view,
      level: details.level,
      message: details.message,
      sourceId: details.sourceId,
      line: details.line,
    });
    writeVerboseLogLine(line);
    if (isWarningOrErrorConsoleLevel(details.level)) {
      writeLayerLogLine('renderer', line);
    }
  });
  Object.defineProperty(webContents, '__windieRendererConsoleLoggingAttached', {
    value: true,
    enumerable: false,
    configurable: true,
  });
  return true;
}

function loadRendererView({
  targetWindow,
  view,
  app,
  path,
  vmMode = false,
  enableDevTransparencyUi = false,
  enableDebugStreamTrace = false,
  enableDebugToolScreenshot = false,
}) {
  const query = {};
  if (view) {
    query.view = view;
  }
  if (vmMode) {
    query.vm_mode = '1';
  }
  if (enableDevTransparencyUi) {
    query.dev_ui = '1';
  }
  if (enableDebugStreamTrace) {
    query.debug_stream = '1';
  }
  if (enableDebugToolScreenshot) {
    query.debug_tool_screenshot = '1';
  }

  if (app.isPackaged) {
    const rendererEntryFile = path.join(__dirname, '../../../dist/index.html');
    targetWindow.loadFile(
      rendererEntryFile,
      Object.keys(query).length > 0 ? { query } : undefined,
    );
    return;
  }

  const devUrl = 'http://localhost:5173';
  const queryString = new URLSearchParams(query).toString();
  if (queryString) {
    targetWindow.loadURL(`${devUrl}?${queryString}`);
  } else {
    targetWindow.loadURL(devUrl);
  }
}

function createOverlayBrowserWindow({
  BrowserWindow,
  path,
  platform = process.platform,
  width,
  height,
  show = false,
  icon = null,
  allowDevTools = false,
}) {
  const windowOptions = {
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      additionalArguments: [buildPreloadIpcChannelsArgument()],
      contextIsolation: true,
      nodeIntegration: false,
      devTools: Boolean(allowDevTools),
    },
  };
  if (icon) {
    windowOptions.icon = icon;
  }
  if (platform === 'darwin') {
    windowOptions.type = 'panel';
  } else if (platform === 'win32') {
    windowOptions.type = 'toolbar';
  }
  windowOptions.show = show === true;
  return new BrowserWindow(windowOptions);
}

function createLazyRendererViewLoader(options) {
  let rendererLoaded = false;

  return () => {
    if (rendererLoaded) {
      return false;
    }
    rendererLoaded = true;
    loadRendererView(options);
    return true;
  };
}

module.exports = {
  attachRendererConsoleLogging,
  createLazyRendererViewLoader,
  createOverlayBrowserWindow,
  loadRendererView,
};
