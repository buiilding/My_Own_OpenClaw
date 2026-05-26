/** @jest-environment node */

const {
  broadcastSidecarEvent,
  buildLocalBackendStatusPayload,
  sendLocalBackendStatus,
} = require('../../frontend/src/main/local_backend_status_broadcaster.cjs');

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

  test('broadcasts sidecar events only to live windows', () => {
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

    broadcastSidecarEvent(() => [liveWindow, destroyedWindow, null], {
      type: 'daemon-ready',
    });

    expect(liveWindow.webContents.send).toHaveBeenCalledWith('sidecar-event', {
      type: 'daemon-ready',
    });
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  });
});
