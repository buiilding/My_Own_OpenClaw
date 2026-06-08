const {
  createScreenshotWindowVisibilityRuntime,
} = require('../platform/screenshot_window_visibility/index.cjs');

function createWindowResolvers(getWindows) {
  const resolveWindowProvider = () => {
    if (typeof getWindows === 'function') {
      return getWindows;
    }
    if (getWindows && typeof getWindows === 'object') {
      if ('mainWindow' in getWindows || 'chatWindow' in getWindows) {
        return () => getWindows;
      }
      return () => ({ mainWindow: getWindows, chatWindow: null });
    }
    return () => ({});
  };
  const getWindowState = resolveWindowProvider();

  const resolveWindows = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      const { mainWindow, chatWindow, responseWindow } = result;
      return [mainWindow, chatWindow, responseWindow].filter(Boolean);
    }
    return [];
  };

  const resolveChatWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.chatWindow || null;
    }
    return null;
  };

  const resolveMainWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.mainWindow || null;
    }
    return null;
  };

  const resolveResponseWindow = () => {
    const result = getWindowState();
    if (result && typeof result === 'object') {
      return result.responseWindow || null;
    }
    return null;
  };

  return {
    resolveMainWindow,
    resolveChatWindow,
    resolveResponseWindow,
    resolveWindows,
  };
}

async function withHiddenWindowForScreenshot({
  platform = process.platform,
  resolveWindows,
  resolveChatWindow,
  resolveResponseWindow,
  task,
}) {
  const runtime = createScreenshotWindowVisibilityRuntime(platform);
  return runtime({
    resolveWindows,
    resolveChatWindow,
    resolveResponseWindow,
    task,
  });
}

module.exports = {
  createWindowResolvers,
  withHiddenWindowForScreenshot,
};
