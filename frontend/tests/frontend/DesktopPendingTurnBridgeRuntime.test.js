/**
 * Covers renderer pending-turn bridge row construction.
 */

import {
  DesktopPendingTurnBridgeRuntime,
} from '../../src/renderer/app/runtime/desktopPendingTurnBridgeRuntime';

describe('DesktopPendingTurnBridgeRuntime', () => {
  test('builds pending turn bridge payloads with stable SDK user row ids', () => {
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
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

  test('rejects invalid or padded pending turn bridge identity inputs', () => {
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
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: ' conv-pending ',
      turnRef: 'turn-pending',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: ' turn-pending ',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurn({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: ' user-pending ',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
    })).toBeNull();
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurnUserMessage({
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'hello',
    })).toBeNull();
  });

  test('rejects pending bridge inputs with extra display fields', () => {
    const pendingUserRow = DesktopPendingTurnBridgeRuntime.buildPendingTurnUserMessage({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      visualFields: [{
        id: 'image-1',
        kind: 'image',
        source: 'user_included',
        status: 'ready',
      }],
    });

    expect(pendingUserRow).toBeNull();
  });
});
