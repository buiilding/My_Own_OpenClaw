/** @jest-environment node */

const { createSurfaceRuntime } = require('../../frontend/src/main/surface_runtime.cjs');

function createSurfaceDeps() {
  return {
    screen: {},
    getActiveDisplayAffinity: jest.fn(() => null),
    setActiveDisplayAffinity: jest.fn(),
    syncActiveDisplayAffinityForWindow: jest.fn(),
    getOverlayChatWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 520, height: 116 })),
    getOverlayResponseWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 520, height: 48 })),
    getOverlayContextLabelWindowBounds: jest.fn(() => ({ x: 0, y: 0, width: 280, height: 26 })),
    contextLabelWidth: 280,
    contextLabelHeight: 26,
    contextLabelOffsetX: 14,
    contextLabelGapAboveChatbox: -6,
    responseGap: 2,
    initialChatVisualAnchorHeight: 64,
    responseOverlayPhaseEnum: {
      IDLE: 'idle',
      AWAITING_FIRST_CHUNK: 'awaiting-first-chunk',
      STREAMING: 'streaming',
      TOOL_CALL: 'tool-call',
      TOOL_OUTPUT: 'tool-output',
      COMPLETE: 'complete',
      ERROR: 'error',
    },
    mainWindowOpenTargetChannel: 'main-window-open-target',
    mainWindowOpenTargets: new Set(['chat', 'settings']),
    windowPlatformPolicy: {
      applyContentProtection: jest.fn(),
      applyOverlayWindowPolicy: jest.fn(),
      activateWindowForInteraction: jest.fn(),
    },
    warn: jest.fn(),
  };
}

describe('surface_runtime', () => {
  test('owns window state and one-time main-process IPC initialization', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const mainWindow = { id: 'main' };
    const chatWindow = { id: 'chat' };

    runtime.setMainWindow(mainWindow);
    runtime.setChatWindow(chatWindow);

    expect(runtime.getWindows()).toEqual(expect.objectContaining({
      mainWindow,
      chatWindow,
      responseWindow: null,
      contextLabelWindow: null,
    }));

    const initializer = jest.fn();
    expect(runtime.initializeMainProcessIpcOnce(initializer)).toBe(true);
    expect(runtime.initializeMainProcessIpcOnce(initializer)).toBe(false);
    expect(initializer).toHaveBeenCalledTimes(1);
  });

  test('owns VM worker runtime lifecycle', () => {
    const runtime = createSurfaceRuntime(createSurfaceDeps());
    const vmWorkerRuntime = { stop: jest.fn() };

    runtime.setVmWorkerRuntime(vmWorkerRuntime);

    expect(runtime.stopVmWorker()).toBe(true);
    expect(vmWorkerRuntime.stop).toHaveBeenCalledTimes(1);
    expect(runtime.stopVmWorker()).toBe(false);
  });
});
