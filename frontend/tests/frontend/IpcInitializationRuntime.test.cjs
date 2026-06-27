/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createIpcInitializationRuntime,
} = require('../../src/main/ipc/ipc_initialization_runtime.cjs');

function registerable(name, calls) {
  return {
    register: jest.fn(() => {
      calls.push(`${name}.register`);
    }),
  };
}

describe('ipc initialization runtime', () => {
  test('runs initialize-time reset, startup, handler, and SDK registration in order', () => {
    const calls = [];
    const ipcMain = { id: 'ipc-main' };
    const win = { id: 'main-window' };
    const getWindows = jest.fn(() => ({ mainWindow: win, chatWindow: { id: 'chat' } }));
    const handleRendererChatQuery = jest.fn();
    const handleRendererStopQuery = jest.fn();
    const hostOptionState = {
      applyInitializeOptions: jest.fn(() => calls.push('hostOptionState.applyInitializeOptions')),
      getOnBeforeOverlayQueryCapture: jest.fn(() => 'pre-capture'),
    };
    const chatQueryHandlerRuntime = {
      createHandlers: jest.fn((input) => {
        calls.push('chatQueryHandlerRuntime.createHandlers');
        expect(input.getWindows()).toEqual({
          mainWindow: win,
          chatWindow: { id: 'chat' },
        });
        expect(input.onBeforeOverlayQueryCapture).toBe('pre-capture');
        return {
          handleRendererChatQuery,
          handleRendererStopQuery,
        };
      }),
    };
    const agentSdkInvokeHandlerRuntime = {
      register: jest.fn((input) => {
        calls.push('agentSdkInvokeHandlerRuntime.register');
        expect(input).toEqual({
          ipcMain,
          handleRendererChatQuery,
          handleRendererStopQuery,
        });
      }),
    };
    const runtime = createIpcInitializationRuntime({
      ipcMain,
      refreshBackendEndpoints: jest.fn((input) => {
        calls.push(`refreshBackendEndpoints:${input.isPackaged}`);
      }),
      hostOptionState,
      rendererWindowRuntime: {
        reset: jest.fn(() => calls.push('rendererWindowRuntime.reset')),
      },
      trackRendererWindow: jest.fn(() => calls.push('trackRendererWindow')),
      ipcStartupStateRuntime: {
        initialize: jest.fn(() => calls.push('ipcStartupStateRuntime.initialize')),
      },
      desktopUiConfigHandlersRuntime: registerable('desktopUiConfigHandlersRuntime', calls),
      extensionMcpHandlersRuntime: registerable('extensionMcpHandlersRuntime', calls),
      clientSessionHandlersRuntime: registerable('clientSessionHandlersRuntime', calls),
      artifactHandlersRuntime: registerable('artifactHandlersRuntime', calls),
      imageInteractionHandlersRuntime: registerable('imageInteractionHandlersRuntime', calls),
      rendererDiagnosticsHandlersRuntime: registerable('rendererDiagnosticsHandlersRuntime', calls),
      pendingTurnRuntime: registerable('pendingTurnRuntime', calls),
      chatQueryHandlerRuntime,
      agentSdkInvokeHandlerRuntime,
    });

    runtime.initialize(win, {
      isPackaged: true,
      getWindows,
    });

    expect(calls).toEqual([
      'refreshBackendEndpoints:true',
      'hostOptionState.applyInitializeOptions',
      'rendererWindowRuntime.reset',
      'trackRendererWindow',
      'ipcStartupStateRuntime.initialize',
      'desktopUiConfigHandlersRuntime.register',
      'extensionMcpHandlersRuntime.register',
      'clientSessionHandlersRuntime.register',
      'artifactHandlersRuntime.register',
      'imageInteractionHandlersRuntime.register',
      'rendererDiagnosticsHandlersRuntime.register',
      'pendingTurnRuntime.register',
      'chatQueryHandlerRuntime.createHandlers',
      'agentSdkInvokeHandlerRuntime.register',
    ]);
    expect(getWindows).toHaveBeenCalledTimes(1);
  });

  test('defaults window lookup to main window plus null chat window', () => {
    const win = { id: 'main-window' };
    let resolvedWindows = null;
    const runtime = createIpcInitializationRuntime({
      ipcMain: {},
      refreshBackendEndpoints: jest.fn(),
      hostOptionState: {
        applyInitializeOptions: jest.fn(),
        getOnBeforeOverlayQueryCapture: jest.fn(() => null),
      },
      rendererWindowRuntime: { reset: jest.fn() },
      trackRendererWindow: jest.fn(),
      ipcStartupStateRuntime: { initialize: jest.fn() },
      desktopUiConfigHandlersRuntime: { register: jest.fn() },
      extensionMcpHandlersRuntime: { register: jest.fn() },
      clientSessionHandlersRuntime: { register: jest.fn() },
      artifactHandlersRuntime: { register: jest.fn() },
      imageInteractionHandlersRuntime: { register: jest.fn() },
      rendererDiagnosticsHandlersRuntime: { register: jest.fn() },
      pendingTurnRuntime: { register: jest.fn() },
      chatQueryHandlerRuntime: {
        createHandlers: jest.fn((input) => {
          resolvedWindows = input.getWindows();
          return {
            handleRendererChatQuery: jest.fn(),
            handleRendererStopQuery: jest.fn(),
          };
        }),
      },
      agentSdkInvokeHandlerRuntime: { register: jest.fn() },
    });

    runtime.initialize(win);

    expect(resolvedWindows).toEqual({
      mainWindow: win,
      chatWindow: null,
    });
  });

  test('ipc.cjs delegates initialize orchestration to the initialization runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcInitializationRuntime({');
    expect(mainSource).toContain('ipcInitializationRuntime.initialize(win, options)');
    expect(mainSource).not.toContain('ipcStartupStateRuntime.initialize();');
    expect(mainSource).not.toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(mainSource).not.toContain('agentSdkInvokeHandlerRuntime.register({');
    expect(helperSource).toContain('function createIpcInitializationRuntime');
    expect(helperSource).toContain('ipcStartupStateRuntime.initialize();');
    expect(helperSource).toContain('chatQueryHandlerRuntime.createHandlers({');
    expect(helperSource).toContain('agentSdkInvokeHandlerRuntime.register({');
  });
});
