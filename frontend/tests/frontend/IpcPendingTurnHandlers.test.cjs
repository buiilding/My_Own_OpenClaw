/**
 * Covers pending-turn IPC handler registration behavior.
 */

const fs = require('fs/promises');
const path = require('path');

const pendingTurnHandlers = require('../../src/main/ipc/ipc_pending_turn_handlers.cjs');

const {
  createPendingTurnRuntime,
} = pendingTurnHandlers;

function createHarness() {
  const listeners = {};
  let latestPendingTurn = null;
  const ipcMain = {
    on: jest.fn((channel, listener) => {
      listeners[channel] = listener;
    }),
  };
  const broadcastToRenderers = jest.fn();
  const liveTurnState = {
    getLatestPendingTurn: jest.fn(() => latestPendingTurn),
    setLatestPendingTurn: jest.fn((pendingTurn) => {
      latestPendingTurn = pendingTurn;
    }),
  };
  const runtime = createPendingTurnRuntime({
    liveTurnState,
    broadcastToRenderers,
  });

  runtime.register({ ipcMain });

  return {
    broadcastToRenderers,
    getLatestPendingTurn: () => latestPendingTurn,
    ipcMain,
    liveTurnState,
    listeners,
  };
}

describe('pending turn IPC handlers', () => {
  test('normalizes pending-turn envelopes and drops visual payload fields through the runtime', () => {
    const { getLatestPendingTurn, listeners } = createHarness();

    listeners['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn: {
        conversationRef: ' conv-1 ',
        turnRef: ' turn-1 ',
        userMessageId: ' user-1 ',
        text: '',
        timestamp: ' 2026-06-19T00:00:00.000Z ',
        attachmentFilenames: [' one.png ', '', 42, 'two.png'],
        attachments: [
          {
            id: ' attachment-1 ',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            filename: ' one.png ',
            screenshotRef: ' artifact-one ',
          },
          {
            id: 'bad-attachment',
            kind: 'file',
            source: 'user_included',
            status: 'ready',
          },
        ],
        screenshots: [
          {
            screenshot: 'inline-base64',
            screenshotContentType: ' image/png ',
          },
          {
            screenshot: '',
            screenshotUrl: ' ',
          },
        ],
      },
    });

    expect(getLatestPendingTurn()).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: '',
      timestamp: ' 2026-06-19T00:00:00.000Z ',
    });
    expect(getLatestPendingTurn()).not.toHaveProperty('attachmentFilenames');
  });

  test('rejects incomplete pending-turn payloads through the runtime', () => {
    const { broadcastToRenderers, getLatestPendingTurn, liveTurnState, listeners } = createHarness();

    listeners['windie:pending-turn']({}, {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      text: 'missing user message id',
      timestamp: '2026-06-19T00:00:00.000Z',
    });

    expect(getLatestPendingTurn()).toBeNull();
    expect(liveTurnState.setLatestPendingTurn).not.toHaveBeenCalled();
    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('stores and broadcasts normalized pending turns', () => {
    const { broadcastToRenderers, getLatestPendingTurn, listeners } = createHarness();

    listeners['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
        text: 'hello',
        timestamp: '2026-06-19T00:00:00.000Z',
      },
    });

    expect(getLatestPendingTurn()).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: 'hello',
      timestamp: '2026-06-19T00:00:00.000Z',
    });
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn: getLatestPendingTurn(),
    });
  });

  test('ignores stale snake_case clear filters and broadcasts camelCase clears', () => {
    const {
      broadcastToRenderers,
      getLatestPendingTurn,
      liveTurnState,
      listeners,
    } = createHarness();

    listeners['windie:pending-turn']({}, {
      type: 'clear',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
    });

    expect(liveTurnState.setLatestPendingTurn).not.toHaveBeenCalled();
    expect(broadcastToRenderers).not.toHaveBeenCalled();

    listeners['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
        text: 'hello',
        timestamp: '2026-06-19T00:00:00.000Z',
      },
    });
    expect(getLatestPendingTurn()).toEqual(expect.objectContaining({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    }));
    liveTurnState.setLatestPendingTurn.mockClear();
    broadcastToRenderers.mockClear();

    listeners['windie:pending-turn']({}, {
      type: 'clear',
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
    });

    expect(liveTurnState.setLatestPendingTurn).toHaveBeenCalledWith(null);
    expect(getLatestPendingTurn()).toBeNull();
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
  });

  test('clears matching pending-turn state and can broadcast fallback refs', () => {
    let latestPendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };
    const broadcastToRenderers = jest.fn();
    const runtime = createPendingTurnRuntime({
      liveTurnState: {
        getLatestPendingTurn: () => latestPendingTurn,
        setLatestPendingTurn: (pendingTurn) => {
          latestPendingTurn = pendingTurn;
        },
      },
      broadcastToRenderers,
    });

    expect(runtime.clear({ broadcast: true })).toBe(true);

    expect(latestPendingTurn).toBeNull();
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
  });

  test('keeps target matching private behind clear-pending state', () => {
    let latestPendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };
    const broadcastToRenderers = jest.fn();
    const runtime = createPendingTurnRuntime({
      liveTurnState: {
        getLatestPendingTurn: () => latestPendingTurn,
        setLatestPendingTurn: (pendingTurn) => {
          latestPendingTurn = pendingTurn;
        },
      },
      broadcastToRenderers,
    });

    expect(pendingTurnHandlers).not.toHaveProperty('pendingTurnMatchesTarget');
    expect(pendingTurnHandlers).not.toHaveProperty('clearPendingTurnState');
    expect(runtime.clear({
      broadcast: true,
      conversationRef: 'conv-2',
      turnRef: 'turn-1',
    })).toBe(false);
    expect(latestPendingTurn).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
    expect(broadcastToRenderers).not.toHaveBeenCalled();
  });

  test('runtime composes pending-turn state and renderer fan-out once', () => {
    let latestPendingTurn = {
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    };
    const listeners = {};
    const ipcMain = {
      on: jest.fn((channel, listener) => {
        listeners[channel] = listener;
      }),
    };
    const liveTurnState = {
      getLatestPendingTurn: jest.fn(() => latestPendingTurn),
      setLatestPendingTurn: jest.fn((pendingTurn) => {
        latestPendingTurn = pendingTurn;
      }),
    };
    const broadcastToRenderers = jest.fn();
    const runtime = createPendingTurnRuntime({
      liveTurnState,
      broadcastToRenderers,
    });

    runtime.register({ ipcMain });

    expect(runtime.clear({ broadcast: true })).toBe(true);
    expect(liveTurnState.setLatestPendingTurn).toHaveBeenCalledWith(null);
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });

    listeners['windie:pending-turn']({}, {
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-2',
        turnRef: 'turn-2',
        userMessageId: 'user-2',
        text: 'next',
        timestamp: '2026-06-20T00:00:00.000Z',
      },
    });

    expect(liveTurnState.setLatestPendingTurn).toHaveBeenLastCalledWith({
      conversationRef: 'conv-2',
      turnRef: 'turn-2',
      userMessageId: 'user-2',
      text: 'next',
      timestamp: '2026-06-20T00:00:00.000Z',
    });
  });

  test('matches SDK current turns by conversation and turn ref', () => {
    const runtime = createPendingTurnRuntime();

    expect(runtime.matchesCurrentTurn(
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
    )).toBe(true);
    expect(runtime.matchesCurrentTurn(
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
      { conversationRef: 'conv-1', turnRef: 'turn-2' },
    )).toBe(false);
  });

  test('ipc.cjs delegates pending-turn channel bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_pending_turn_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createPendingTurnRuntime({');
    expect(mainSource).toContain('pendingTurnMatchesCurrentTurn: pendingTurnRuntime.matchesCurrentTurn');
    expect(mainSource).not.toContain('pendingTurnMatchesCurrentTurn,');
    expect(mainSource).toContain('pendingTurnRuntime.clear(input)');
    expect(mainSource).not.toContain('pendingTurnRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('pendingTurnRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerPendingTurnHandlers({');
    expect(mainSource).not.toContain('clearPendingTurnState({');
    expect(mainSource).not.toContain('ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
    expect(helperSource).toContain('function createPendingTurnRuntime');
    expect(helperSource).toContain('return clearPendingTurnState({');
    expect(helperSource).toContain('matchesCurrentTurn');
    expect(helperSource).not.toContain('  clearPendingTurnState,');
    expect(helperSource).not.toContain('  normalizePendingTurnPayload,');
    expect(helperSource).not.toContain('  pendingTurnMatchesCurrentTurn,');
    expect(helperSource).toContain('ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
    expect(pendingTurnHandlers.registerPendingTurnHandlers).toBeUndefined();
    expect(pendingTurnHandlers.normalizePendingTurnPayload).toBeUndefined();
    expect(pendingTurnHandlers.pendingTurnMatchesCurrentTurn).toBeUndefined();
  });
});
