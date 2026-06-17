/** @jest-environment node */

const {
  broadcastConversationMetadataInvalidation,
  buildLocalRuntimeStatusPayload,
  sendLocalRuntimeStatus,
} = require('../../frontend/src/main/sidecar/local_backend_status_broadcaster.cjs');

describe('local_backend_status_broadcaster', () => {
  test('builds local runtime status from supervisor and SDK local runtime snapshots', () => {
    expect(buildLocalRuntimeStatusPayload({
      supervisor: {
        getSnapshot: () => ({
          ready: true,
          status: 'ready',
          lastError: '',
        }),
      },
      localRuntimeSnapshot: { provider: 'sdk', hasClient: true },
    })).toEqual({
      ready: true,
      status: 'ready',
      error: '',
      sidecarDaemon: { provider: 'sdk', hasClient: true },
    });
  });

  test('sends local runtime status to the target window', () => {
    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    sendLocalRuntimeStatus(mainWindow, { ready: true });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('local-backend-status', {
      ready: true,
    });
  });

  test('broadcasts conversation metadata invalidations only to live windows', () => {
    const liveWindow = {
      isDestroyed: () => false,
      webContents: {
        send: jest.fn(),
      },
    };
    const destroyedWindow = {
      isDestroyed: () => true,
      webContents: {
        send: jest.fn(),
      },
    };

    broadcastConversationMetadataInvalidation(() => [liveWindow, destroyedWindow, null], {
      type: 'conversation-title-updated',
      payload: {
        conversation_id: 'conv-title',
        title: 'Generated title',
        source: 'model',
      },
    });

    expect(liveWindow.webContents.send).toHaveBeenCalledWith(
      'windie:conversation-metadata-invalidated',
      expect.objectContaining({
        type: 'conversation-metadata-invalidated',
        reason: 'conversation-title-updated',
        conversationRef: 'conv-title',
        title: 'Generated title',
        source: 'model',
      }),
    );
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('ignores unrelated sidecar events', () => {
    const liveWindow = {
      isDestroyed: () => false,
      webContents: {
        send: jest.fn(),
      },
    };

    broadcastConversationMetadataInvalidation(() => [liveWindow], {
      type: 'daemon-ready',
    });

    expect(liveWindow.webContents.send).not.toHaveBeenCalled();
  });
});
