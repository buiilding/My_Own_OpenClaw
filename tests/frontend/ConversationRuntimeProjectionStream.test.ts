/**
 * Covers conversation runtime projection stream transcript merging.
 */

import { mergeRendererAnnotations } from '../../frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream';
import type { ChatMessage } from '../../frontend/src/renderer/features/chat/stores/chatStore';

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? 'message-id',
    sender: overrides.sender ?? 'assistant',
    text: overrides.text ?? '',
    ...overrides,
  };
}

describe('mergeRendererAnnotations', () => {
  test('preserves optimistic user row while sdk rows have not projected that user turn', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkToolRow = message({
      id: 'tool-row',
      sender: 'assistant',
      text: 'Reading files',
      type: 'tool-call',
      turnRef: 'turn-1',
      sourceEventType: 'tool_call',
      sourceChannel: 'windie:rows',
    });

    expect(mergeRendererAnnotations([sdkToolRow], [optimisticUser])).toEqual([
      optimisticUser,
      sdkToolRow,
    ]);
  });

  test('drops optimistic user row once sdk projects the same user turn', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
    });
    const sdkUserRow = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'user_message',
      sourceChannel: 'windie:rows',
      isComplete: true,
    });

    expect(mergeRendererAnnotations([sdkUserRow], [optimisticUser])).toEqual([
      sdkUserRow,
    ]);
  });
});
