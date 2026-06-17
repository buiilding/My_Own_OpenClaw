/**
 * Provides local sidecar status broadcasting for the Electron main process.
 */

const {
  conversationMetadataInvalidationFromLocalRuntimeEvent,
} = require('../../../../packages/windie-sdk-js/cjs/index.js');
const {
  DESKTOP_AGENT_ON_CHANNELS,
} = require('../ipc/ipc_desktop_agent_channels.cjs');

function sendLocalRuntimeStatus(mainWindow, payload) {
  mainWindow?.webContents.send('local-backend-status', payload);
}

function buildLocalRuntimeStatusPayload({
  supervisor,
  localRuntimeSnapshot,
} = {}) {
  const snapshot = supervisor?.getSnapshot?.() || {};
  return {
    ready: snapshot.ready === true,
    status: typeof snapshot.status === 'string' ? snapshot.status : 'stopped',
    error: typeof snapshot.lastError === 'string' ? snapshot.lastError : '',
    sidecarDaemon: localRuntimeSnapshot || null,
  };
}

function broadcastConversationMetadataInvalidation(resolveWindows, payload) {
  const invalidation = conversationMetadataInvalidationFromLocalRuntimeEvent(payload);
  if (!invalidation) {
    return;
  }
  const windows = typeof resolveWindows === 'function' ? resolveWindows() : [];
  for (const win of windows) {
    if (!win || win.isDestroyed?.()) {
      continue;
    }
    win.webContents?.send?.(
      DESKTOP_AGENT_ON_CHANNELS.CONVERSATION_METADATA_INVALIDATED,
      invalidation,
    );
  }
}

module.exports = {
  broadcastConversationMetadataInvalidation,
  buildLocalRuntimeStatusPayload,
  sendLocalRuntimeStatus,
};
