/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  initializePermissionHandlersRuntime,
} = require('../../src/main/permissions/permission_ipc_runtime.cjs');

describe('permission_ipc_runtime', () => {
  const runtimeDirs = [];

  afterEach(() => {
    while (runtimeDirs.length > 0) {
      fs.rmSync(runtimeDirs.pop(), { recursive: true, force: true });
    }
  });

  function createRuntime(overrides = {}) {
    const invokeHandlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        invokeHandlers[channel] = handler;
      }),
    };
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-permission-runtime-'));
    runtimeDirs.push(userDataPath);

    initializePermissionHandlersRuntime({
      ipcMain,
      shell: {},
      systemPreferences: {},
      platform: 'win32',
      userDataPath,
      ...overrides,
    });

    return {
      invokeHandlers,
    };
  }

  test('registers permission handlers outside the overlay phase runtime', () => {
    const { invokeHandlers } = createRuntime();

    expect(typeof invokeHandlers['list-permissions']).toBe('function');
    expect(typeof invokeHandlers['check-permissions']).toBe('function');
    expect(typeof invokeHandlers['check-permission']).toBe('function');
    expect(typeof invokeHandlers['run-permission-probe']).toBe('function');
    expect(typeof invokeHandlers['request-permission']).toBe('function');
    expect(typeof invokeHandlers['set-active-workspace']).toBe('function');
    expect(invokeHandlers['show-chatbox']).toBeUndefined();
  });

  test('fails screen capture probes closed when no host verifier is configured', async () => {
    const { invokeHandlers } = createRuntime();

    const result = await invokeHandlers['run-permission-probe'](null, {
      permissionId: 'screen_capture',
    });

    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'screen_capture',
          status: 'needs-action',
          granted: false,
          reason: 'Screen capture verifier is not configured.',
          details: expect.objectContaining({
            capability_check: expect.objectContaining({
              granted: false,
              reason: 'Screen capture verifier is not configured.',
              details: {
                configured: false,
              },
            }),
          }),
        }),
      },
    });
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

  test('records idle permission probes as app diagnostics instead of conversation traces', async () => {
    const traceEvents = [];
    const appDiagnostics = [];
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
      emitAppDiagnosticEvent: jest.fn(async (event) => {
        appDiagnostics.push(event);
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
    expect(traceEvents).toHaveLength(0);
    expect(appDiagnostics.map((event) => `${event.stage}:${event.status}`)).toEqual([
      'probe:started',
      'probe:succeeded',
    ]);
    expect(appDiagnostics[1]).toEqual(expect.objectContaining({
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
    expect(JSON.stringify(appDiagnostics)).not.toContain('selected_paths');
    expect(JSON.stringify(appDiagnostics)).not.toContain('Workspace access prompt');
  });

  test('records permission probe conversation traces only with explicit turn context', async () => {
    const traceEvents = [];
    const appDiagnostics = [];
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
      emitAppDiagnosticEvent: jest.fn(async (event) => {
        appDiagnostics.push(event);
      }),
    });

    const result = await invokeHandlers['run-permission-probe'](null, {
      permissionId: 'filesystem_workspace_access',
      conversationRef: 'conv-test',
      turnRef: 'turn-test',
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
    expect(appDiagnostics).toHaveLength(0);
    expect(traceEvents.map((event) => `${event.stage}:${event.status}`)).toEqual([
      'probe:started',
      'probe:succeeded',
    ]);
    expect(traceEvents[1]).toEqual(expect.objectContaining({
      path: 'permission.probe',
      runtime: 'electron-main',
      conversationRef: 'conv-test',
      turnRef: 'turn-test',
      data: expect.objectContaining({
        permissionId: 'filesystem_workspace_access',
        permissionStatus: 'needs-action',
        granted: false,
      }),
    }));
  });

  test('ignores removed snake_case permission trace context aliases', async () => {
    const traceEvents = [];
    const appDiagnostics = [];
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
      emitAppDiagnosticEvent: jest.fn(async (event) => {
        appDiagnostics.push(event);
      }),
    });

    const result = await invokeHandlers['run-permission-probe'](null, {
      permissionId: 'filesystem_workspace_access',
      conversation_ref: 'conv-snake',
      turn_ref: 'turn-snake',
      _trace: {
        conversation_ref: 'conv-nested-snake',
        turn_ref: 'turn-nested-snake',
      },
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
    expect(traceEvents).toHaveLength(0);
    expect(appDiagnostics.map((event) => `${event.stage}:${event.status}`)).toEqual([
      'probe:started',
      'probe:succeeded',
    ]);
    expect(JSON.stringify(appDiagnostics)).not.toContain('conv-snake');
    expect(JSON.stringify(appDiagnostics)).not.toContain('turn-snake');
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
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-workspace-'));
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
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-conversation-workspace-'));
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

  test('records active workspace changes as sanitized app diagnostics without paths', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-diagnostic-workspace-'));
    const appDiagnostics = [];
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
      emitAppDiagnosticEvent: jest.fn(async (event) => {
        appDiagnostics.push(event);
      }),
    });

    const result = await invokeHandlers['set-active-workspace'](null, {
      workspacePath,
    });

    expect(result).toEqual({
      success: true,
      data: {
        status: expect.objectContaining({
          permission_id: 'filesystem_workspace_access',
          granted: true,
        }),
      },
    });
    expect(appDiagnostics.map((event) => `${event.stage}:${event.status}`)).toEqual([
      'workspace_activate:started',
      'workspace_activate:succeeded',
    ]);
    expect(appDiagnostics[1]).toEqual(expect.objectContaining({
      path: 'permission.probe',
      runtime: 'electron-main',
      data: expect.objectContaining({
        permissionId: 'filesystem_workspace_access',
        permissionStatus: 'granted',
        granted: true,
        hasWorkspacePath: true,
      }),
    }));
    expect(JSON.stringify(appDiagnostics)).not.toContain(workspacePath);
    expect(JSON.stringify(appDiagnostics)).not.toContain('selected_paths');
  });

  test('rejects arbitrary active workspace paths that were not selected through permission flow', async () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'project-alpha-untrusted-workspace-'));
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
