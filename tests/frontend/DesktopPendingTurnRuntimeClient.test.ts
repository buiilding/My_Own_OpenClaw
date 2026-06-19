/**
 * Covers desktop pending-turn runtime client broadcast classification.
 */

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/channels', () => ({
  DESKTOP_RUNTIME_SEND_CHANNELS: {
    PENDING_TURN: 'windie:pending-turn',
  },
}));

import {
  resolveDesktopPendingTurnBroadcastAction,
} from '../../frontend/src/renderer/app/runtime/desktopPendingTurnRuntimeClient';

describe('DesktopPendingTurnRuntimeClient', () => {
  test('classifies pending broadcasts as pending actions', () => {
    expect(resolveDesktopPendingTurnBroadcastAction({
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    })).toEqual({
      kind: 'pending',
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    });
  });

  test('classifies clear broadcasts with normalized filters', () => {
    expect(resolveDesktopPendingTurnBroadcastAction({
      type: 'clear',
      conversationRef: ' conv-clear ',
      turnRef: ' turn-clear ',
    })).toEqual({
      kind: 'clear',
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
    });
  });

  test('falls back malformed broadcasts to pending actions without state data', () => {
    expect(resolveDesktopPendingTurnBroadcastAction(null)).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
  });
});
