/** @jest-environment node */

const {
  createWindowBootstrapRuntime,
} = require('../../src/main/app/main_process_bootstrap_runtime.cjs');

describe('main_process_bootstrap_runtime', () => {
  function createDeps(overrides = {}) {
    const state = {
      windows: {
        mainWindow: null,
        chatWindow: null,
        responseWindow: null,
      },
      vmWorkerRuntime: null,
      responseOverlayPhase: 'idle',
      applyResponseOverlayPhase: jest.fn(),
      setResponseOverlayVisible: jest.fn(),
    };

    return {
      state,
      deps: {
        BrowserWindow: jest.fn(),
        Tray: jest.fn(),
        Menu: { buildFromTemplate: jest.fn() },
        path: require('path'),
        app: {},
        platform: 'linux',
        enableDevTransparencyUi: false,
        enableDebugStreamTrace: false,
        enableDebugToolScreenshot: false,
        vmMode: false,
        vmWorkerMode: false,
        ipcMain: { on: jest.fn(), handle: jest.fn() },
        runsApiKeyHeader: 'x-sample-runs-key',
        vmWorkerEnv: {
          workspaceId: 'SAMPLE_VM_WORKSPACE_ID',
        },
        appIconFileName: 'sample.app.png',
        rendererLogPrefix: '[SampleApp]',
        trayTooltip: 'Sample Desktop',
        bundledRuntimeCopy: {
          missingRuntimeMessage: 'Please reinstall this sample app',
        },
        runtimePaths: {
          pythonPath: 'SAMPLE_PYTHON_PATH',
        },
        localRuntimeDaemonEntrypoint: 'sidecar_daemon.py',
        localRuntimeEnv: {
          backendHttpUrl: 'SAMPLE_BACKEND_HTTP_URL',
        },
        wakewordEnv: {
          packagedApp: 'SAMPLE_PACKAGED_APP',
        },
        wakewordModelName: 'sample_wakeword',
        wakewordStderrLogMarkers: ['sample_wakeword'],
        localRuntimeBridgeCopy: {
          browserWarmupExplanation: 'Open the sample browser',
        },
        enableOsToolGhostDebug: false,
        responseWindowDebugView: 'tool-ghost-debug',
        initializeIpc: jest.fn(),
        setAgentLoopStopShortcutEnabled: jest.fn(),
        localToolLifecycle: { beforeExecute: jest.fn() },
        syncSdkLiveTurnSurfaceIntent: jest.fn(),
        initializeWakewordBridge: jest.fn(),
        initializeLocalRuntimeBridge: jest.fn(),
        getKnownLocalRuntime: jest.fn(),
        ensureLocalRuntime: jest.fn(),
        initializeMainProcessIpc: jest.fn(),
        createVmWorkerRuntime: jest.fn(),
        getBackendConnectionState: jest.fn(),
        sendAutomatedQuery: jest.fn(),
        stopQueryThroughAgentSdkRuntime: jest.fn(),
        registerBackendMessageObserver: jest.fn(),
        createMainWindowRuntime: jest.fn(() => ({ id: 'main-window' })),
        createChatWindowRuntime: jest.fn(() => ({ id: 'chat-window' })),
        createResponseWindowRuntime: jest.fn(() => ({ id: 'response-window' })),
        createTrayRuntime: jest.fn(() => ({ id: 'tray' })),
        prepareOverlayQueryCaptureFocus: jest.fn(),
        showChatWindow: jest.fn(),
        hideChatWindow: jest.fn(),
        showMainWindow: jest.fn(),
        emitWakewordSttTrigger: jest.fn(),
        positionChatWindow: jest.fn(),
        positionResponseWindow: jest.fn(),
        showResponseWindowInactive: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
        setResponseOverlayVisibilityState: jest.fn(),
        syncWindowDisplayAffinity: jest.fn(),
        getState: () => state,
        setMainWindow: jest.fn((nextWindow) => {
          state.windows.mainWindow = nextWindow;
        }),
        setChatWindow: jest.fn((nextWindow) => {
          state.windows.chatWindow = nextWindow;
        }),
        setResponseWindow: jest.fn((nextWindow) => {
          state.windows.responseWindow = nextWindow;
        }),
        setVmWorkerRuntime: jest.fn((nextRuntime) => {
          state.vmWorkerRuntime = nextRuntime;
        }),
        log: jest.fn(),
        warn: jest.fn(),
        ...overrides,
      },
    };
  }

  test('createWindow delegates to main window runtime and stores the result', () => {
    const { deps, state } = createDeps();
    const runtime = createWindowBootstrapRuntime(deps);

    runtime.createWindow();

    expect(deps.createMainWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      setAgentLoopStopShortcutEnabled: deps.setAgentLoopStopShortcutEnabled,
      localToolLifecycle: deps.localToolLifecycle,
      syncSdkLiveTurnSurfaceIntent: deps.syncSdkLiveTurnSurfaceIntent,
      getKnownLocalRuntime: deps.getKnownLocalRuntime,
      ensureLocalRuntime: deps.ensureLocalRuntime,
      appIconFileName: 'sample.app.png',
      rendererLogPrefix: '[SampleApp]',
      bundledRuntimeCopy: deps.bundledRuntimeCopy,
      runtimePaths: deps.runtimePaths,
      localRuntimeDaemonEntrypoint: 'sidecar_daemon.py',
      localRuntimeEnv: deps.localRuntimeEnv,
      ipcMain: deps.ipcMain,
      wakewordEnv: deps.wakewordEnv,
      wakewordModelName: deps.wakewordModelName,
      wakewordStderrLogMarkers: deps.wakewordStderrLogMarkers,
      localRuntimeBridgeCopy: deps.localRuntimeBridgeCopy,
    }));
    expect(deps.createMainWindowRuntime.mock.calls[0][0]).not.toHaveProperty('mainHostSkin');
    expect(deps.createMainWindowRuntime.mock.calls[0][0]).not.toHaveProperty(
      'getLatestDesktopUiConfig',
    );
    expect(deps.createMainWindowRuntime.mock.calls[0][0]).not.toHaveProperty(
      'getLatestFrontendConfig',
    );
    expect(state.windows.mainWindow).toEqual({ id: 'main-window' });
  });

  test('createWindow starts vm worker runtime once when vm worker mode is enabled', () => {
    const vmWorkerRuntime = { start: jest.fn() };
    const { deps, state } = createDeps({
      vmWorkerMode: true,
      createVmWorkerRuntime: jest.fn(() => vmWorkerRuntime),
    });
    const runtime = createWindowBootstrapRuntime(deps);

    runtime.createWindow();
    runtime.createWindow();

    expect(deps.createVmWorkerRuntime).toHaveBeenCalledTimes(1);
    expect(deps.createVmWorkerRuntime).toHaveBeenCalledWith(expect.objectContaining({
      sendAutomatedQuery: deps.sendAutomatedQuery,
      stopQueryThroughAgentSdkRuntime: deps.stopQueryThroughAgentSdkRuntime,
      runsApiKeyHeader: 'x-sample-runs-key',
      vmWorkerEnv: expect.objectContaining({
        workspaceId: 'SAMPLE_VM_WORKSPACE_ID',
      }),
    }));
    expect(vmWorkerRuntime.start).toHaveBeenCalledTimes(1);
    expect(state.vmWorkerRuntime).toBe(vmWorkerRuntime);
  });

  test('chat/response/tray builders delegate to their runtimes and persist returned windows', () => {
    const { deps, state } = createDeps();
    const runtime = createWindowBootstrapRuntime(deps);

    expect(runtime.createChatWindow()).toEqual({ id: 'chat-window' });
    expect(runtime.createResponseWindow()).toEqual({ id: 'response-window' });
    expect(runtime.createTray()).toEqual({ id: 'tray' });

    expect(state.windows.chatWindow).toEqual({ id: 'chat-window' });
    expect(state.windows.responseWindow).toEqual({ id: 'response-window' });
    expect(deps.createChatWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      appIconFileName: 'sample.app.png',
      rendererLogPrefix: '[SampleApp]',
    }));
    expect(deps.createResponseWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      appIconFileName: 'sample.app.png',
      rendererLogPrefix: '[SampleApp]',
    }));
    expect(deps.createTrayRuntime).toHaveBeenCalledWith(expect.objectContaining({
      appIconFileName: 'sample.app.png',
      trayTooltip: 'Sample Desktop',
    }));
    expect(deps.createChatWindowRuntime.mock.calls[0][0]).not.toHaveProperty('mainHostSkin');
    expect(deps.createResponseWindowRuntime.mock.calls[0][0]).not.toHaveProperty('mainHostSkin');
    expect(deps.createTrayRuntime.mock.calls[0][0]).not.toHaveProperty('mainHostSkin');
    expect(state.applyResponseOverlayPhase).toHaveBeenCalledWith({ phase: 'idle' });
  });

  test('recreated overlays sync the current phase without inheriting protection state', () => {
    const { deps, state } = createDeps();
    state.responseOverlayPhase = 'tool-call';
    const runtime = createWindowBootstrapRuntime(deps);

    runtime.createChatWindow();
    runtime.createResponseWindow();

    expect(deps.createChatWindowRuntime.mock.calls[0][0]).not.toHaveProperty('overlayContentProtectionEnabled');
    expect(deps.createResponseWindowRuntime.mock.calls[0][0]).not.toHaveProperty('overlayContentProtectionEnabled');
    expect(state.applyResponseOverlayPhase).toHaveBeenCalledWith({ phase: 'tool-call' });
  });
});
