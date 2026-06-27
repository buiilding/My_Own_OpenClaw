/**
 * Covers desktop pending-turn runtime client broadcast classification.
 */

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    send: jest.fn(),
  },
}));

jest.mock('../../src/renderer/infrastructure/ipc/channels', () => ({
  DESKTOP_RUNTIME_SEND_CHANNELS: {
    PENDING_TURN: 'windie:pending-turn',
  },
}));

import * as DesktopPendingTurnRuntimeModule from '../../src/renderer/app/runtime/desktopPendingTurnRuntimeClient';
import {
  DesktopPendingTurnRuntimeClient,
} from '../../src/renderer/app/runtime/desktopPendingTurnRuntimeClient';

describe('DesktopPendingTurnRuntimeClient', () => {
  test('classifies pending broadcasts as pending actions', () => {
    expect(DesktopPendingTurnRuntimeModule).not.toHaveProperty('resolveDesktopPendingTurnBroadcastAction');
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
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
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
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
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction(null)).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
  });
});
