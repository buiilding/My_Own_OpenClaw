/**
 * Covers renderer pending-turn bridge row construction.
 */

import {
  DesktopPendingTurnBridgeRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopPendingTurnBridgeRuntime';

describe('DesktopPendingTurnBridgeRuntime', () => {
  test('builds a renderer-local pending user row without visual attachments', () => {
    expect(DesktopPendingTurnBridgeRuntime.buildPendingTurnUserMessage({
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'hello',
      timestamp: '2026-06-25T12:00:00.000Z',
      attachmentFilenames: ['image.png'],
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
      attachmentFilenames: ['image.png'],
      attachments: null,
    });
  });

  test('merges a pending row by id without appending duplicates', () => {
    const messages = [
      {
        id: 'user-pending',
        sender: 'user',
        text: 'old text',
        turnRef: 'turn-pending',
      },
      {
        id: 'assistant-old',
        sender: 'assistant',
        text: 'old answer',
      },
    ];

    expect(DesktopPendingTurnBridgeRuntime.mergePendingTurnUserMessage(messages, {
      conversationRef: 'conv-pending',
      turnRef: 'turn-pending',
      userMessageId: 'user-pending',
      text: 'new text',
      timestamp: '2026-06-25T12:01:00.000Z',
      attachmentFilenames: null,
    })).toEqual([
      expect.objectContaining({
        id: 'user-pending',
        text: 'new text',
        sourceEventType: 'renderer-compose',
        attachments: null,
      }),
      messages[1],
    ]);
  });
});
