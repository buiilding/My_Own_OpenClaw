/**
 * Provides the local backend status broadcaster module for the Electron main process.
 */

const {
  conversationMetadataInvalidationFromLocalRuntimeEvent,
} = require('../../../../packages/windie-sdk-js/cjs/index.js');

function sendLocalBackendStatus(mainWindow, payload) {
  mainWindow?.webContents.send('local-backend-status', payload);
}

function buildLocalBackendStatusPayload({
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
    win.webContents?.send?.('windie:conversation-metadata-invalidated', invalidation);
  }
}

module.exports = {
  broadcastConversationMetadataInvalidation,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
};
