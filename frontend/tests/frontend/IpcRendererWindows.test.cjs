/** @jest-environment node */

const {
  createRendererWindowRuntime,
} = require('../../src/main/ipc/ipc_renderer_windows.cjs');
const fs = require('fs/promises');
const path = require('path');

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
  test('syncs latest SDK current turn and ConversationView when a renderer window is tracked', () => {
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
    const conversationView = {
      conversationRef: 'conv-1',
      liveTurn: {
        turnRef: 'turn-1',
        phase: 'complete',
        entries: [],
        isBusy: false,
        isTerminal: true,
        canStop: false,
      },
      surfaces: {
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          ownerConversationRef: 'conv-1',
          turnRef: 'turn-1',
          guardRef: 'turn-1',
        },
      },
    };

    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'tool-output',
      getLatestCurrentTurn: () => currentTurn,
      getLatestConversationView: () => conversationView,
    });
    runtime.track(win);

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'tool-output',
      source: 'sync',
    });
    expect(win.webContents.send).toHaveBeenCalledWith('windie:current-turn', {
      conversationRef: 'conv-1',
      currentTurn,
      view: conversationView,
    });
  });

  test('syncs latest ConversationView without raw current turn when a renderer window is tracked', () => {
    const win = createWindowMock();
    const conversationView = {
      conversationRef: 'conv-view',
      liveTurn: {
        turnRef: 'turn-view',
        phase: 'streaming',
        entries: [{ id: 'entry-view' }],
        isBusy: true,
        isTerminal: false,
        canStop: true,
      },
      surfaces: {
        responseOverlay: {
          mode: 'response',
          visible: true,
          ownerConversationRef: 'conv-view',
          turnRef: 'turn-view',
          guardRef: 'turn-view',
        },
      },
    };

    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'streaming',
      getLatestCurrentTurn: () => null,
      getLatestConversationView: () => conversationView,
    });
    runtime.track(win);

    expect(win.webContents.send).toHaveBeenCalledWith('windie:current-turn', {
      conversationRef: 'conv-view',
      currentTurn: null,
      view: conversationView,
    });
  });

  test('syncs latest pending turn when a renderer window is tracked', () => {
    const win = createWindowMock();
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-16T00:00:00.000Z',
    };

    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'idle',
      getLatestPendingTurn: () => pendingTurn,
    });
    runtime.track(win);

    expect(win.webContents.send).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn,
    });
  });

  test('does not send current-turn sync when none exists', () => {
    const win = createWindowMock();

    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'idle',
      getLatestCurrentTurn: () => null,
    });
    runtime.track(win);

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'idle',
      source: 'sync',
    });
    expect(win.webContents.send).not.toHaveBeenCalledWith(
      'windie:current-turn',
      expect.anything(),
    );
  });

  test('registry owns renderer window set for track, broadcast, and reset', () => {
    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'idle',
    });
    const firstWindow = createWindowMock();
    const secondWindow = createWindowMock();

    runtime.track(firstWindow);
    runtime.track(secondWindow);

    expect(runtime.size()).toBe(2);

    runtime.broadcast('test-channel', { ok: true }, firstWindow.webContents);

    expect(firstWindow.webContents.send).not.toHaveBeenCalledWith(
      'test-channel',
      { ok: true },
    );
    expect(secondWindow.webContents.send).toHaveBeenCalledWith('test-channel', { ok: true });

    runtime.reset();
    expect(runtime.size()).toBe(0);
  });

  test('runtime composes renderer sync dependencies for track and broadcast', () => {
    const registry = {
      broadcast: jest.fn(),
      reset: jest.fn(),
      size: jest.fn(() => 1),
      track: jest.fn(),
    };
    const runtime = createRendererWindowRuntime({
      registry,
      getResponseOverlayPhase: () => 'streaming',
      getLatestCurrentTurn: () => ({ turnRef: 'turn-1' }),
      getLatestConversationView: () => null,
      getLatestPendingTurn: () => null,
      getReplayEvents: () => [],
    });
    const win = createWindowMock();

    runtime.track(win);
    runtime.broadcast('test-channel', { ok: true }, null);

    expect(registry.track).toHaveBeenCalledWith({
      win,
      getResponseOverlayPhase: expect.any(Function),
      getLatestCurrentTurn: expect.any(Function),
      getLatestConversationView: expect.any(Function),
      getLatestPendingTurn: expect.any(Function),
      getReplayEvents: expect.any(Function),
      buildConversationEvent: null,
    });
    expect(registry.broadcast).toHaveBeenCalledWith({
      channel: 'test-channel',
      payload: { ok: true },
      sourceWebContents: null,
    });
    expect(runtime.size()).toBe(1);

    runtime.reset();
    expect(registry.reset).toHaveBeenCalled();
  });

  test('ipc.cjs delegates renderer window storage to the runtime facade', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_renderer_windows.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createRendererWindowRuntime({');
    expect(mainSource).toContain('rendererWindowRuntime.track(win)');
    expect(mainSource).toContain('rendererWindowRuntime.broadcast(channel, payload, sourceWebContents)');
    expect(mainSource).toContain('rendererWindowRuntime,');
    expect(mainSource).not.toContain('createRendererWindowRegistry()');
    expect(mainSource).not.toContain('rendererWindowRegistry.track({');
    expect(mainSource).not.toContain('rendererWindowRegistry.broadcast({');
    expect(mainSource).not.toContain('let rendererWindows = new Set()');
    expect(mainSource).not.toContain('rendererWindows = new Set()');
    expect(helperSource).toContain('function createRendererWindowRuntime');
    expect(helperSource).toContain('const rendererWindows = new Set();');
    const helperModule = require('../../src/main/ipc/ipc_renderer_windows.cjs');
    expect(helperModule.trackRendererWindow).toBeUndefined();
    expect(helperModule.broadcastToRenderers).toBeUndefined();
    expect(helperModule.createRendererWindowRegistry).toBeUndefined();
  });
});
