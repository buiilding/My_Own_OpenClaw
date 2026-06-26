/**
 * Covers chat store turn refs. behavior in the frontend test suite.
 */

import {
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  DesktopChatTurnConversationRefRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatTurnConversationRefRuntime';
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
    const store = useChatStore.getState();

    store.addMessage({
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
    const store = useChatStore.getState();

    store.addMessage({
      id: 'message-1',
      sender: 'assistant',
      text: 'hello',
    }, 'conv-a');
    useChatStore.getState().updateMessage('message-1', { turnRef: '   ' }, 'conv-a');

    expect(resolveRendererConversationRefForTurn('')).toBeNull();
    expect(getRendererTurnConversationRefsSnapshot()).toEqual({});

    useChatStore.getState().updateMessage('message-1', { turnRef: ' turn-2 ' }, 'conv-a');

    expect(resolveRendererConversationRefForTurn('turn-2')).toBe('conv-a');
    expect(Object.keys(getRendererTurnConversationRefsSnapshot())).toEqual(['turn-2']);
  });
});
