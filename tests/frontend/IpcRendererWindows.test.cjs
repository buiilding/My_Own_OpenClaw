/** @jest-environment node */

const {
  trackRendererWindow,
} = require('../../frontend/src/main/ipc/ipc_renderer_windows.cjs');

function createWindowMock() {
  const listeners = new Map();
  const webContents = {
    send: jest.fn(),
    on: jest.fn((eventName, listener) => {
      listeners.set(eventName, listener);
    }),
    removeListener: jest.fn((eventName) => {
      listeners.delete(eventName);
    }),
    isLoadingMainFrame: jest.fn(() => false),
  };
  return {
    isDestroyed: jest.fn(() => false),
    on: jest.fn(),
    webContents,
    listeners,
  };
}

describe('ipc_renderer_windows', () => {
  test('syncs latest SDK current turn when a renderer window is tracked', () => {
    const rendererWindows = new Set();
    const win = createWindowMock();
    const currentTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'complete',
      assistantText: 'done',
      reasoningText: null,
      toolEvents: [],
      lastError: null,
    };

    trackRendererWindow({
      win,
      rendererWindows,
      getResponseOverlayPhase: () => 'tool-output',
      getLatestCurrentTurn: () => currentTurn,
    });

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'tool-output',
      source: 'sync',
    });
    expect(win.webContents.send).toHaveBeenCalledWith('windie:current-turn', currentTurn);
  });

  test('does not send current-turn sync when none exists', () => {
    const rendererWindows = new Set();
    const win = createWindowMock();

    trackRendererWindow({
      win,
      rendererWindows,
      getResponseOverlayPhase: () => 'idle',
      getLatestCurrentTurn: () => null,
    });

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'idle',
      source: 'sync',
    });
    expect(win.webContents.send).not.toHaveBeenCalledWith(
      'windie:current-turn',
      expect.anything(),
    );
  });
});
