function trackRendererWindow({
  win,
  rendererWindows,
  getResponseOverlayPhase,
}) {
  if (!win || (win.isDestroyed && win.isDestroyed())) {
    return;
  }
  rendererWindows.add(win);
  const webContents = win.webContents;
  const canSubscribeToLoad = Boolean(
    webContents
      && typeof webContents.on === 'function'
      && typeof webContents.removeListener === 'function',
  );
  const canCheckLoadingState = Boolean(
    webContents && typeof webContents.isLoadingMainFrame === 'function',
  );
  const syncResponseOverlayPhase = () => {
    if (!win || win.isDestroyed()) {
      return;
    }
    if (!webContents || typeof webContents.send !== 'function') {
      return;
    }
    webContents.send('response-overlay-phase', {
      phase: getResponseOverlayPhase(),
      source: 'sync',
    });
  };
  if (canSubscribeToLoad) {
    webContents.on('did-finish-load', syncResponseOverlayPhase);
  }
  if (!canCheckLoadingState || !webContents.isLoadingMainFrame()) {
    syncResponseOverlayPhase();
  }
  if (typeof win.on !== 'function') {
    return;
  }
  win.on('closed', () => {
    if (canSubscribeToLoad) {
      webContents.removeListener('did-finish-load', syncResponseOverlayPhase);
    }
    rendererWindows.delete(win);
  });
}

function broadcastToRenderers({
  rendererWindows,
  channel,
  payload,
  sourceWebContents = null,
}) {
  for (const win of rendererWindows) {
    if (!win || win.isDestroyed()) {
      rendererWindows.delete(win);
      continue;
    }
    if (sourceWebContents && win.webContents === sourceWebContents) {
      continue;
    }
    win.webContents.send(channel, payload);
  }
}

module.exports = {
  broadcastToRenderers,
  trackRendererWindow,
};
