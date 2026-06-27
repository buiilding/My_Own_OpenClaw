/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const hostOptionStateModule = require('../../src/main/ipc/ipc_host_option_state.cjs');
const {
  createIpcHostOptionState,
} = hostOptionStateModule;

describe('ipc_host_option_state', () => {
  test('normalizes optional function and object values through host option state', () => {
    const state = createIpcHostOptionState();
    const fn = () => undefined;
    const objectValue = { beforeExecute: fn };

    state.applyInitializeOptions({
      applyResponseOverlayPhase: fn,
      localToolLifecycle: objectValue,
      WebSocketImpl: 'not-a-function',
    });

    expect(state.getApplyResponseOverlayPhase()).toBe(fn);
    expect(state.getLocalToolLifecycle()).toBe(objectValue);
    expect(state.getAgentWebSocketImpl()).toBeNull();

    state.applyInitializeOptions({
      applyResponseOverlayPhase: 'not-a-function',
      localToolLifecycle: [],
    });

    expect(state.getApplyResponseOverlayPhase()).toBeNull();
    expect(state.getLocalToolLifecycle()).toBeNull();
  });

  test('builds desktop local-runtime launch config through host option state', () => {
    const state = createIpcHostOptionState();

    state.applyInitializeOptions({
      isPackaged: true,
      permissionStatePath: 'permissions.json',
      authStatePath: 'install-auth.json',
      bundledRuntimeCopy: { source: 'runtime-copy' },
      localRuntimeDaemonEntrypoint: 'daemon.py',
      localRuntimeEnv: { SAMPLE_TEST: '1' },
      runtimePaths: { python: 'python.exe' },
    });

    expect(state.getDesktopLocalRuntimeLaunchConfig()).toEqual({
      isPackaged: true,
      permissionStatePath: 'permissions.json',
      authStatePath: 'install-auth.json',
      copy: { source: 'runtime-copy' },
      daemonEntrypoint: 'daemon.py',
      localRuntimeEnv: { SAMPLE_TEST: '1' },
      runtimePaths: { python: 'python.exe' },
    });
  });

  test('stores initialize option callbacks and resets them', () => {
    const state = createIpcHostOptionState();
    const applyResponseOverlayPhase = jest.fn();
    const onBeforeOverlayQueryCapture = jest.fn();
    const setAgentLoopStopShortcutEnabled = jest.fn();
    const setGlobalAgentStopShortcutAccelerator = jest.fn();
    const localToolLifecycle = { beforeExecute: jest.fn() };
    const syncSdkLiveTurnSurfaceIntent = jest.fn();
    const WebSocketImpl = jest.fn();

    state.applyInitializeOptions({
      isPackaged: true,
      applyResponseOverlayPhase,
      onBeforeOverlayQueryCapture,
      setAgentLoopStopShortcutEnabled,
      setGlobalAgentStopShortcutAccelerator,
      localToolLifecycle,
      syncSdkLiveTurnSurfaceIntent,
      WebSocketImpl,
      permissionStatePath: 'permissions.json',
    });

    expect(state.getApplyResponseOverlayPhase()).toBe(applyResponseOverlayPhase);
    expect(state.getOnBeforeOverlayQueryCapture()).toBe(onBeforeOverlayQueryCapture);
    expect(state.getSetAgentLoopStopShortcutEnabled()).toBe(setAgentLoopStopShortcutEnabled);
    expect(state.getSetGlobalAgentStopShortcutAccelerator()).toBe(
      setGlobalAgentStopShortcutAccelerator,
    );
    expect(state.getLocalToolLifecycle()).toBe(localToolLifecycle);
    expect(state.getSyncSdkLiveTurnSurfaceIntent()).toBe(syncSdkLiveTurnSurfaceIntent);
    expect(state.getAgentWebSocketImpl()).toBe(WebSocketImpl);
    expect(state.getDesktopLocalRuntimeLaunchConfig()).toEqual(expect.objectContaining({
      isPackaged: true,
      permissionStatePath: 'permissions.json',
    }));

    state.applyInitializeOptions({
      applyResponseOverlayPhase: 'not-a-function',
      localToolLifecycle: [],
    });
    expect(state.getApplyResponseOverlayPhase()).toBeNull();
    expect(state.getLocalToolLifecycle()).toBeNull();

    state.reset();
    expect(state.getOnBeforeOverlayQueryCapture()).toBeNull();
    expect(state.getSetAgentLoopStopShortcutEnabled()).toBeNull();
    expect(state.getSetGlobalAgentStopShortcutAccelerator()).toBeNull();
    expect(state.getSyncSdkLiveTurnSurfaceIntent()).toBeNull();
    expect(state.getAgentWebSocketImpl()).toBeNull();
    expect(state.getDesktopLocalRuntimeLaunchConfig()).toBeNull();
  });

  test('ipc.cjs delegates host option storage to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_host_option_state.cjs'),
      'utf8',
    );
    const initializationRuntimeSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcHostOptionState()');
    expect(mainSource).toContain('hostOptionState,');
    expect(initializationRuntimeSource).toContain('hostOptionState.applyInitializeOptions(options)');
    expect(mainSource).toContain('hostOptionState.getLocalToolLifecycle()');
    expect(mainSource).toContain('hostOptionState.getAgentWebSocketImpl()');
    expect(mainSource).toContain('hostOptionState.getDesktopLocalRuntimeLaunchConfig()');
    expect(mainSource).not.toContain('let localToolLifecycle = null');
    expect(mainSource).not.toContain('let agentWebSocketImpl = null');
    expect(mainSource).not.toContain('let desktopLocalRuntimeLaunchConfig = null');
    expect(mainSource).not.toContain('let applyResponseOverlayPhase = null');
    expect(mainSource).not.toContain('let onBeforeOverlayQueryCapture = null');
    expect(helperSource).toContain('let localToolLifecycle = null;');
    expect(helperSource).toContain('let agentWebSocketImpl = null;');
    expect(helperSource).toContain('let desktopLocalRuntimeLaunchConfig = null;');
    expect(hostOptionStateModule.buildDesktopLocalRuntimeLaunchConfig).toBeUndefined();
    expect(hostOptionStateModule.normalizeOptionalFunction).toBeUndefined();
    expect(hostOptionStateModule.normalizeOptionalObject).toBeUndefined();
  });
});
