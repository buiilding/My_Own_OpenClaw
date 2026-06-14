/**
 * Handles ipc response overlay handlers events for the Electron main process.
 */

function registerResponseOverlayHandlers({
  ipcMain,
  getResponseOverlayPhase,
  setResponseOverlayPhase,
}) {
  ipcMain.handle('prime-response-overlay-awaiting', async () => {
    const currentPhase = getResponseOverlayPhase();
    if (
      currentPhase !== 'streaming'
      && currentPhase !== 'tool-call'
      && currentPhase !== 'tool-output'
    ) {
      setResponseOverlayPhase('awaiting-first-chunk', 'renderer-send-preflight');
    }
    return { success: true };
  });
}

module.exports = {
  registerResponseOverlayHandlers,
};
