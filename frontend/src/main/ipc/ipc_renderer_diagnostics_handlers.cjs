/**
 * Handles renderer diagnostic IPC events for the Electron main process.
 */

function registerRendererDiagnosticsHandlers({
  ipcMain,
  handleRendererLog,
  handleRendererLiveSurfaceTrace,
}) {
  ipcMain.on('renderer-log', (_event, payload = {}) => {
    handleRendererLog(payload);
  });

  ipcMain.on('live-surface-trace', (_event, payload = {}) => {
    handleRendererLiveSurfaceTrace(payload);
  });
}

module.exports = {
  registerRendererDiagnosticsHandlers,
};
