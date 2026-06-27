/** @jest-environment node */

const fs = require('fs');
const path = require('path');
const {
  broadcastConversationMetadataInvalidation,
  buildLocalRuntimeStatusPayload,
  sendLocalRuntimeStatus,
} = require('../../src/main/sidecar/local_runtime_status_broadcaster.cjs');
const {
  DESKTOP_RUNTIME_ON_CHANNELS,
} = require('../../src/main/ipc/ipc_desktop_runtime_channels.cjs');

const broadcasterPath = path.resolve(
  __dirname,
  '../../src/main/sidecar/local_runtime_status_broadcaster.cjs',
);

describe('local_runtime_status_broadcaster', () => {
  test('imports conversation metadata projection from the SDK owner module', () => {
    const source = fs.readFileSync(broadcasterPath, 'utf8');

    expect(source).toContain(
      'packages/windie-sdk-js/cjs/runtime/ConversationContinuityService.js',
    );
    expect(source).not.toContain('packages/windie-sdk-js/cjs/index.js');
  });

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
      localRuntime: { provider: 'sdk', hasClient: true },
    });
  });

  test('sends local runtime status to the target window', () => {
    const mainWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    sendLocalRuntimeStatus(mainWindow, { ready: true });

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      DESKTOP_RUNTIME_ON_CHANNELS.LOCAL_RUNTIME_STATUS,
      { ready: true },
    );
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
      DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_METADATA_INVALIDATED,
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

  test('ignores unrelated local runtime events', () => {
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
