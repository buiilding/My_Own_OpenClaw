/** @jest-environment node */

const {
  broadcastConversationMetadataInvalidation,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
} = require('../../frontend/src/main/sidecar/local_backend_status_broadcaster.cjs');

describe('local_backend_status_broadcaster', () => {
  test('builds local backend status from supervisor and daemon snapshots', () => {
    expect(buildLocalBackendStatusPayload({
      supervisor: {
        getSnapshot: () => ({
          ready: true,
          status: 'ready',
          lastError: '',
        }),
      },
      sidecarDaemonManager: {
        getSnapshot: () => ({ pid: 123 }),
      },
    })).toEqual({
      ready: true,
      status: 'ready',
      error: '',
      sidecarDaemon: { pid: 123 },
    });
  });

  test('sends local backend status to the target window', () => {
    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    sendLocalBackendStatus(mainWindow, { ready: true });

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
