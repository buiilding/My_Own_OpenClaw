/** @jest-environment node */

const {
  createWindowBootstrapRuntime,
} = require('../../frontend/src/main/main_process_bootstrap_runtime.cjs');

describe('main_process_bootstrap_runtime', () => {
  function createDeps(overrides = {}) {
    const state = {
      windows: {
        mainWindow: null,
        chatWindow: null,
        responseWindow: null,
        contextLabelWindow: null,
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
        enableOsToolGhostDebug: false,
        responseWindowDebugView: 'tool-ghost-debug',
        initializeIpc: jest.fn(),
        setAgentLoopStopShortcutEnabled: jest.fn(),
        initializeWakewordBridge: jest.fn(),
        initializeLocalBackendBridge: jest.fn(),
        initializeMainProcessIpc: jest.fn(),
        createVmWorkerRuntime: jest.fn(),
        getBackendConnectionState: jest.fn(),
        sendAutomatedQuery: jest.fn(),
        sendMessageToBackend: jest.fn(),
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
        getLatestFrontendConfig: jest.fn(),
        positionChatWindow: jest.fn(),
        positionResponseWindow: jest.fn(),
        showResponseWindowInactive: jest.fn(),
        syncWakewordToggleForChatVisibility: jest.fn(),
        syncContextLabelWindowVisibility: jest.fn(),
        setResponseOverlayVisibilityState: jest.fn(),
        enableContentProtectionSafely: jest.fn(),
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
    }));
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
      overlayContentProtectionEnabled: false,
    }));
    expect(deps.createResponseWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      syncWindowDisplayAffinity: deps.syncWindowDisplayAffinity,
      overlayContentProtectionEnabled: false,
    }));
    expect(deps.createTrayRuntime).toHaveBeenCalled();
    expect(state.applyResponseOverlayPhase).toHaveBeenCalledWith({ phase: 'idle' });
  });

  test('recreated overlays inherit active-loop content protection state', () => {
    const { deps, state } = createDeps();
    state.responseOverlayPhase = 'tool-call';
    const runtime = createWindowBootstrapRuntime(deps);

    runtime.createChatWindow();
    runtime.createResponseWindow();

    expect(deps.createChatWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      overlayContentProtectionEnabled: true,
    }));
    expect(deps.createResponseWindowRuntime).toHaveBeenCalledWith(expect.objectContaining({
      overlayContentProtectionEnabled: true,
    }));
    expect(state.applyResponseOverlayPhase).toHaveBeenCalledWith({ phase: 'tool-call' });
  });
});
