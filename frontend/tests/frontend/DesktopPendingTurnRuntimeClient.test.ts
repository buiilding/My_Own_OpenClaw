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
        userMessageId: 'user-pending',
        text: 'pending prompt',
        timestamp: '2026-06-27T00:00:00.000Z',
      },
    })).toEqual({
      kind: 'pending',
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'pending prompt',
        timestamp: '2026-06-27T00:00:00.000Z',
      },
    });
  });

  test('rejects partial or attachment-bearing pending broadcasts at the IPC adapter', () => {
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
      },
    })).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-pending',
        turnRef: 'turn-pending',
        userMessageId: 'user-pending',
        text: 'pending prompt',
        timestamp: '2026-06-27T00:00:00.000Z',
        attachments: [{ id: 'attachment-1' }],
      },
    })).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
  });

  test('classifies clear broadcasts with exact filters', () => {
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
      type: 'clear',
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
    })).toEqual({
      kind: 'clear',
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
    });
  });

  test('rejects clear broadcasts with visual pending-turn fields', () => {
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
      type: 'clear',
      conversationRef: 'conv-clear',
      turnRef: 'turn-clear',
      attachments: [{ id: 'attachment-1' }],
      displayAttachmentId: 'renderer-display-id',
      previewSrc: 'data:image/png;base64,preview',
    })).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
  });

  test('does not repair padded clear broadcast filters', () => {
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction({
      type: 'clear',
      conversationRef: ' conv-clear ',
      turnRef: ' turn-clear ',
    })).toEqual({
      kind: 'clear',
      conversationRef: null,
      turnRef: null,
    });
  });

  test('falls back malformed broadcasts to pending actions without state data', () => {
    expect(DesktopPendingTurnRuntimeClient.resolveBroadcastAction(null)).toEqual({
      kind: 'pending',
      pendingTurn: undefined,
    });
  });
});
