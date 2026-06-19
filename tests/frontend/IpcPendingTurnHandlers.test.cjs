/**
 * Covers pending-turn IPC handler registration behavior.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  clearPendingTurnState,
  normalizePendingTurnPayload,
  pendingTurnMatchesCurrentTurn,
  registerPendingTurnHandlers,
} = require('../../frontend/src/main/ipc/ipc_pending_turn_handlers.cjs');

function createHarness() {
  const listeners = {};
  let latestPendingTurn = null;
  const ipcMain = {
    on: jest.fn((channel, listener) => {
      listeners[channel] = listener;
    }),
  };
  const broadcastToRenderers = jest.fn();
  const clearLatestPendingTurn = jest.fn(({ conversationRef, turnRef } = {}) => {
    latestPendingTurn = null;
    return { conversationRef, turnRef };
  });

  registerPendingTurnHandlers({
    ipcMain,
    setLatestPendingTurn: (pendingTurn) => {
      latestPendingTurn = pendingTurn;
    },
    clearLatestPendingTurn,
    broadcastToRenderers,
  });

  return {
    broadcastToRenderers,
    clearLatestPendingTurn,
    getLatestPendingTurn: () => latestPendingTurn,
    ipcMain,
    listeners,
  };
}

describe('pending turn IPC handlers', () => {
  test('normalizes pending-turn envelopes and attachment filenames', () => {
    expect(normalizePendingTurnPayload({
      type: 'pending',
      pendingTurn: {
        conversationRef: ' conv-1 ',
        turnRef: ' turn-1 ',
        userMessageId: ' user-1 ',
        text: '',
        timestamp: ' 2026-06-19T00:00:00.000Z ',
        attachmentFilenames: [' one.png ', '', 42, 'two.png'],
      },
    })).toEqual({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      userMessageId: 'user-1',
      text: '',
      timestamp: ' 2026-06-19T00:00:00.000Z ',
      attachmentFilenames: [' one.png ', 'two.png'],
    });
  });

  test('rejects incomplete pending-turn payloads', () => {
    expect(normalizePendingTurnPayload({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      text: 'missing user message id',
      timestamp: '2026-06-19T00:00:00.000Z',
    })).toBeNull();
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
      attachmentFilenames: null,
    });
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'pending',
      pendingTurn: getLatestPendingTurn(),
    });
  });

  test('ignores stale snake_case clear filters and broadcasts camelCase clears', () => {
    const { broadcastToRenderers, clearLatestPendingTurn, listeners } = createHarness();

    listeners['windie:pending-turn']({}, {
      type: 'clear',
      conversation_ref: 'conv-1',
      turn_ref: 'turn-1',
    });

    expect(clearLatestPendingTurn).not.toHaveBeenCalled();
    expect(broadcastToRenderers).not.toHaveBeenCalled();

    listeners['windie:pending-turn']({}, {
      type: 'clear',
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
    });

    expect(clearLatestPendingTurn).toHaveBeenCalledWith({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
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

    expect(clearPendingTurnState({
      getLatestPendingTurn: () => latestPendingTurn,
      setLatestPendingTurn: (pendingTurn) => {
        latestPendingTurn = pendingTurn;
      },
      broadcastToRenderers,
      broadcast: true,
    })).toBe(true);

    expect(latestPendingTurn).toBeNull();
    expect(broadcastToRenderers).toHaveBeenCalledWith('windie:pending-turn', {
      type: 'clear',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
  });

  test('matches SDK current turns by conversation and turn ref', () => {
    expect(pendingTurnMatchesCurrentTurn(
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
    )).toBe(true);
    expect(pendingTurnMatchesCurrentTurn(
      { conversationRef: 'conv-1', turnRef: 'turn-1' },
      { conversationRef: 'conv-1', turnRef: 'turn-2' },
    )).toBe(false);
  });

  test('ipc.cjs delegates pending-turn channel bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_pending_turn_handlers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('registerPendingTurnHandlers({');
    expect(mainSource).not.toContain('ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
    expect(helperSource).toContain('ipcMain.on(DESKTOP_RUNTIME_SEND_CHANNELS.PENDING_TURN');
  });
});
