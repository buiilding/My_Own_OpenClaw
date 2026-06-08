const {
  buildPreloadIpcChannelsArgument,
} = require('../ipc/ipc_channel_registry_runtime.cjs');

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
  createLazyRendererViewLoader,
  createOverlayBrowserWindow,
  loadRendererView,
};
