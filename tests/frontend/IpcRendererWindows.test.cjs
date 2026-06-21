/** @jest-environment node */

const {
  createRendererWindowRegistry,
  createRendererWindowRuntime,
} = require('../../frontend/src/main/ipc/ipc_renderer_windows.cjs');
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
  test('syncs latest SDK current turn when a renderer window is tracked', () => {
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

    const runtime = createRendererWindowRuntime({
      getResponseOverlayPhase: () => 'tool-output',
      getLatestCurrentTurn: () => currentTurn,
    });
    runtime.track(win);

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'tool-output',
      source: 'sync',
    });
    expect(win.webContents.send).toHaveBeenCalledWith('windie:current-turn', currentTurn);
  });

  test('syncs latest pending turn when a renderer window is tracked', () => {
    const win = createWindowMock();
    const pendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-16T00:00:00.000Z',
      attachmentFilenames: null,
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
    const registry = createRendererWindowRegistry();
    const firstWindow = createWindowMock();
    const secondWindow = createWindowMock();

    registry.track({
      win: firstWindow,
      getResponseOverlayPhase: () => 'idle',
    });
    registry.track({
      win: secondWindow,
      getResponseOverlayPhase: () => 'streaming',
    });

    expect(registry.size()).toBe(2);

    registry.broadcast({
      channel: 'test-channel',
      payload: { ok: true },
      sourceWebContents: firstWindow.webContents,
    });

    expect(firstWindow.webContents.send).not.toHaveBeenCalledWith(
      'test-channel',
      { ok: true },
    );
    expect(secondWindow.webContents.send).toHaveBeenCalledWith('test-channel', { ok: true });

    registry.reset();
    expect(registry.size()).toBe(0);
  });

  test('runtime composes renderer sync dependencies for track and broadcast', () => {
    const registry = createRendererWindowRegistry();
    const runtime = createRendererWindowRuntime({
      registry,
      getResponseOverlayPhase: () => 'streaming',
      getLatestCurrentTurn: () => ({ turnRef: 'turn-1' }),
      getLatestPendingTurn: () => null,
      getReplayEvents: () => [],
    });
    const win = createWindowMock();

    runtime.track(win);
    runtime.broadcast('test-channel', { ok: true }, null);

    expect(win.webContents.send).toHaveBeenCalledWith('response-overlay-phase', {
      phase: 'streaming',
      source: 'sync',
    });
    expect(win.webContents.send).toHaveBeenCalledWith('windie:current-turn', {
      turnRef: 'turn-1',
    });
    expect(win.webContents.send).toHaveBeenCalledWith('test-channel', { ok: true });
    expect(runtime.size()).toBe(1);

    runtime.reset();
    expect(runtime.size()).toBe(0);
  });

  test('ipc.cjs delegates renderer window storage to the registry', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_renderer_windows.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createRendererWindowRegistry()');
    expect(mainSource).toContain('createRendererWindowRuntime({');
    expect(mainSource).toContain('rendererWindowRuntime.track(win)');
    expect(mainSource).toContain('rendererWindowRuntime.broadcast(channel, payload, sourceWebContents)');
    expect(mainSource).toContain('rendererWindowRuntime,');
    expect(mainSource).not.toContain('rendererWindowRegistry.track({');
    expect(mainSource).not.toContain('rendererWindowRegistry.broadcast({');
    expect(mainSource).not.toContain('let rendererWindows = new Set()');
    expect(mainSource).not.toContain('rendererWindows = new Set()');
    expect(helperSource).toContain('function createRendererWindowRuntime');
    expect(helperSource).toContain('const rendererWindows = new Set();');
    const helperModule = require('../../frontend/src/main/ipc/ipc_renderer_windows.cjs');
    expect(helperModule.trackRendererWindow).toBeUndefined();
    expect(helperModule.broadcastToRenderers).toBeUndefined();
  });
});
