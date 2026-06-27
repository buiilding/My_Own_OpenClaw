/**
 * Covers renderer pending-turn bridge row construction.
 */

import {
  DesktopPendingTurnBridgeRuntime,
} from '../../src/renderer/app/runtime/desktopPendingTurnBridgeRuntime';

describe('DesktopPendingTurnBridgeRuntime', () => {
  test('builds pending turn bridge payloads with stable SDK user row ids', () => {
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: ' conv-pending ',
      turnRef: ' turn-pending ',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toEqual({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'turn-pending-sdk-evt-000002-user_message',
      text: '',
      timestamp: '2026-06-25T12:00:00.000Z',
    });

    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'explicit-user-row',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toEqual(expect.objectContaining({
      userMessageId: 'explicit-user-row',
    }));
  });

  test('rejects invalid pending turn bridge payload inputs', () => {
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: '',
      turnRef: 'turn-pending',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      text: null,
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurnUserMessage({
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'hello',
    })).toBeNull();
  });

  test('builds a renderer-local pending user row without visual attachments', () => {
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurnUserMessage({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachments: [{
        id: 'image-1',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
      }],
    })).toEqual({
      id: 'user-pending',
      text: 'hello',
      sender: 'user',
      turnRef: 'turn-pending',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
      timestamp: '2026-06-25T12:00:00.000Z',
      attachments: null,
    });
  });
});
