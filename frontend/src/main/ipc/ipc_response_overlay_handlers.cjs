/**
 * Handles ipc response overlay handlers events for the Electron main process.
 */

const {
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
} = require('./ipc_overlay_phase_contract.cjs');

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
      setResponseOverlayPhase('awaiting-first-chunk', RESPONSE_OVERLAY_PREFLIGHT_SOURCE);
    }
    return { success: true };
  });
}

module.exports = {
  registerResponseOverlayHandlers,
};
