/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  initializePermissionHandlersRuntime,
} = require('../../frontend/src/main/permissions/permission_ipc_runtime.cjs');

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
    expect(typeof invokeHandlers['set-active-workspace']).toBe('function');
    expect(invokeHandlers['show-chatbox']).toBeUndefined();
  });

  test('returns the same canonical probe envelope for single-permission checks', async () => {
    const permissionStateStore = {
      get: jest.fn(async () => null),
      set: jest.fn(async (_permissionId, entry) => entry),
      delete: jest.fn(async () => true),
    };
    const { invokeHandlers } = createRuntime({
      permissionStateStore,
    });

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

  test('records sanitized permission probe traces from the Electron main owner', async () => {
    const traceEvents = [];
    const permissionStateStore = {
      get: jest.fn(async () => null),
      set: jest.fn(async (_permissionId, entry) => entry),
      delete: jest.fn(async () => true),
    };
    const { invokeHandlers } = createRuntime({
      permissionStateStore,
      emitTraceEvent: jest.fn(async (event) => {
        traceEvents.push(event);
      }),
    });

    const result = await invokeHandlers['run-permission-probe'](null, {
      permissionId: 'filesystem_workspace_access',
    });

    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          status: 'needs-action',
          granted: false,
        }),
      },
    });
    expect(traceEvents.map((event) => `${event.stage}:${event.status}`)).toEqual([
      'probe:started',
      'probe:succeeded',
    ]);
    expect(traceEvents[1]).toEqual(expect.objectContaining({
      path: 'permission.probe',
      runtime: 'electron-main',
      data: expect.objectContaining({
        permissionId: 'filesystem_workspace_access',
        permissionStatus: 'needs-action',
        granted: false,
        hasDetails: true,
        platform: 'win32',
      }),
    }));
    expect(JSON.stringify(traceEvents)).not.toContain('selected_paths');
    expect(JSON.stringify(traceEvents)).not.toContain('Workspace access prompt');
  });

  test('passes browser warmup dependency through request-permission runtime wiring', async () => {
    const warmBrowserAutomationPermission = jest.fn(async () => ({
      success: true,
      details: { status: 'connected' },
    }));
    const verifyBrowserAutomationCapability = jest.fn(async () => ({
      granted: true,
      details: { browser_binary_available: true },
    }));
    const { invokeHandlers } = createRuntime({
      getBrowserAutomationPreference: () => true,
      verifyBrowserAutomationCapability,
      warmBrowserAutomationPermission,
    });

    const result = await invokeHandlers['request-permission'](null, {
      permissionId: 'browser_automation',
    });

    expect(warmBrowserAutomationPermission).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'browser_automation',
          status: 'granted',
          granted: true,
        }),
      },
    });
  });

  test('emits workspace update after a granted workspace selection request', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-workspace-'));
    const emitWorkspaceAccessUpdated = jest.fn();
    const { invokeHandlers } = createRuntime({
      dialog: {
        showOpenDialog: jest.fn(async () => ({
          canceled: false,
          filePaths: [workspacePath],
        })),
      },
      emitWorkspaceAccessUpdated,
    });

    const result = await invokeHandlers['request-permission'](null, {
      permissionId: 'filesystem_workspace_access',
    });

    if (emitWorkspaceAccessUpdated.mock.calls.length !== 1) {
      throw new Error(`expected 1 workspace update, got ${emitWorkspaceAccessUpdated.mock.calls.length}`);
    }
    const emittedStatus = emitWorkspaceAccessUpdated.mock.calls[0][0];
    if (emittedStatus.permission_id !== 'filesystem_workspace_access') {
      throw new Error(`unexpected permission id: ${String(emittedStatus.permission_id)}`);
    }
    if (emittedStatus.granted !== true) {
      throw new Error(`expected granted=true, got ${String(emittedStatus.granted)}`);
    }
    if (JSON.stringify(emittedStatus.details.selected_paths) !== JSON.stringify([workspacePath])) {
      throw new Error(`unexpected selected_paths: ${JSON.stringify(emittedStatus.details.selected_paths)}`);
    }
    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          granted: true,
        }),
      },
    });
  });

  test('sets the active workspace only when the path was already granted', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-conversation-workspace-'));
    const emitWorkspaceAccessUpdated = jest.fn();
    let storedEntry = {
      granted: true,
      source: 'workspace_picker',
      selected_paths: [workspacePath],
      details: {
        selected_paths: [workspacePath],
      },
    };
    const permissionStateStore = {
      get: jest.fn(async () => storedEntry),
      set: jest.fn(async (_permissionId, entry) => {
        storedEntry = entry;
        return storedEntry;
      }),
      delete: jest.fn(async () => {
        storedEntry = null;
        return true;
      }),
    };
    const { invokeHandlers } = createRuntime({
      permissionStateStore,
      emitWorkspaceAccessUpdated,
    });

    const result = await invokeHandlers['set-active-workspace'](null, {
      workspacePath,
    });

    expect(permissionStateStore.set).toHaveBeenCalledWith('filesystem_workspace_access', expect.objectContaining({
      granted: true,
      source: 'workspace_picker',
      selected_paths: [workspacePath],
    }));
    expect(permissionStateStore.delete).not.toHaveBeenCalled();
    const emittedStatus = emitWorkspaceAccessUpdated.mock.calls[0][0];
    if (emittedStatus.permission_id !== 'filesystem_workspace_access') {
      throw new Error(`unexpected permission id: ${String(emittedStatus.permission_id)}`);
    }
    if (emittedStatus.granted !== true) {
      throw new Error(`expected granted=true, got ${String(emittedStatus.granted)}`);
    }
    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          granted: true,
        }),
      },
    });
  });

  test('rejects arbitrary active workspace paths that were not selected through permission flow', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'windieos-untrusted-workspace-'));
    const emitWorkspaceAccessUpdated = jest.fn();
    const permissionStateStore = {
      get: jest.fn(async () => null),
      set: jest.fn(async (_permissionId, entry) => entry),
      delete: jest.fn(async () => true),
    };
    const { invokeHandlers } = createRuntime({
      permissionStateStore,
      emitWorkspaceAccessUpdated,
    });

    const result = await invokeHandlers['set-active-workspace'](null, {
      workspacePath,
    });

    expect(permissionStateStore.set).not.toHaveBeenCalled();
    expect(permissionStateStore.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      error: 'Workspace path must be selected through the workspace permission prompt before it can become active.',
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          granted: false,
        }),
      },
    });
    expect(emitWorkspaceAccessUpdated).toHaveBeenCalledWith(expect.objectContaining({
      permission_id: 'filesystem_workspace_access',
      granted: false,
    }));
  });
});
