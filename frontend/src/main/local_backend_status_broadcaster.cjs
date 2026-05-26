function sendLocalBackendStatus(mainWindow, payload) {
  mainWindow?.webContents.send('local-backend-status', payload);
}

function buildLocalBackendStatusPayload({
  supervisor,
  sidecarDaemonManager,
} = {}) {
  const snapshot = supervisor?.getSnapshot?.() || {};
  return {
    ready: snapshot.ready === true,
    status: typeof snapshot.status === 'string' ? snapshot.status : 'stopped',
    error: typeof snapshot.lastError === 'string' ? snapshot.lastError : '',
    sidecarDaemon: sidecarDaemonManager?.getSnapshot?.() || null,
  };
}

function broadcastSidecarEvent(resolveWindows, payload) {
  const windows = typeof resolveWindows === 'function' ? resolveWindows() : [];
  for (const win of windows) {
    if (!win || win.isDestroyed?.()) {
      continue;
    }
    win.webContents?.send?.('sidecar-event', payload);
  }
}

module.exports = {
  broadcastSidecarEvent,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
};
