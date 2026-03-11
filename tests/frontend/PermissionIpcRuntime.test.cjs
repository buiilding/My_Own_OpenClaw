/** @jest-environment node */

const {
  initializePermissionHandlersRuntime,
} = require('../../frontend/src/main/permission_ipc_runtime.cjs');

describe('permission_ipc_runtime', () => {
  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };

    initializePermissionHandlersRuntime({
      ipcMain,
      shell: {},
      systemPreferences: {},
      platform: 'win32',
      ...overrides,
    });

    return {
      invokeHandlers,
    };
  }

  test('registers permission and sudo handlers outside the overlay phase runtime', () => {
    const { invokeHandlers } = createRuntime();

    expect(typeof invokeHandlers['set-agent-sudo-access']).toBe('function');
    expect(typeof invokeHandlers['list-permissions']).toBe('function');
    expect(typeof invokeHandlers['check-permissions']).toBe('function');
    expect(typeof invokeHandlers['check-permission']).toBe('function');
    expect(typeof invokeHandlers['run-permission-probe']).toBe('function');
    expect(typeof invokeHandlers['request-permission']).toBe('function');
    expect(invokeHandlers['show-chatbox']).toBeUndefined();
  });

  test('returns the same canonical probe envelope for single-permission checks', async () => {
    const { invokeHandlers } = createRuntime();

    const checkResult = await invokeHandlers['check-permission'](null, {
      permissionId: 'filesystem_workspace_access',
    });
    const probeResult = await invokeHandlers['run-permission-probe'](null, {
      permissionId: 'filesystem_workspace_access',
    });

    const checkStatus = checkResult?.data?.status || {};
    const probeStatus = probeResult?.data?.status || {};
    const { checked_at: checkCheckedAt, ...checkStatusWithoutTimestamp } = checkStatus;
    const { checked_at: probeCheckedAt, ...probeStatusWithoutTimestamp } = probeStatus;

    expect(checkStatusWithoutTimestamp).toEqual(probeStatusWithoutTimestamp);
    expect(typeof checkCheckedAt).toBe('string');
    expect(typeof probeCheckedAt).toBe('string');
    expect(checkResult).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          status: 'needs-action',
          granted: false,
        }),
      },
    });
  });
});
