/**
 * Covers chat store turn refs. behavior in the frontend test suite.
 */

import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  addMessageToChatStore,
  updateMessageInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';
import {
  resetChatStoreForTests,
} from './chatStoreTestUtils';

const {
  getRendererTurnConversationRefsSnapshot,
  resolveRendererConversationRefForTurn,
} = DesktopChatTurnConversationRefRuntime;

describe('chatStore turn conversation refs', () => {
  beforeEach(() => {
    resetChatStoreForTests(null);
  });

  test('normalizes turn refs inferred from added messages', () => {
    addMessageToChatStore({
      id: 'message-1',
      sender: 'assistant',
      text: 'hello',
      turnRef: ' turn-1 ',
    }, 'conv-a');

    expect(resolveRendererConversationRefForTurn('turn-1')).toBe('conv-a');
    expect(resolveRendererConversationRefForTurn(' turn-1 ')).toBe('conv-a');
    expect(Object.keys(getRendererTurnConversationRefsSnapshot())).toEqual(['turn-1']);
  });

  test('normalizes turn refs inferred from message updates and ignores blanks', () => {
    addMessageToChatStore({
      id: 'message-1',
      sender: 'assistant',
      text: 'hello',
    }, 'conv-a');
    updateMessageInChatStore('message-1', { turnRef: '   ' }, 'conv-a');

    expect(resolveRendererConversationRefForTurn('')).toBeNull();
    expect(getRendererTurnConversationRefsSnapshot()).toEqual({});

    updateMessageInChatStore('message-1', { turnRef: ' turn-2 ' }, 'conv-a');

    expect(resolveRendererConversationRefForTurn('turn-2')).toBe('conv-a');
    expect(Object.keys(getRendererTurnConversationRefsSnapshot())).toEqual(['turn-2']);
  });
});
