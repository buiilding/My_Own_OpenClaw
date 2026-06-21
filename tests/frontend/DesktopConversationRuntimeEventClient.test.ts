/**
 * Covers desktop conversation runtime event client normalization.
 */

const mockOn = jest.fn();
let mockChannelListeners = new Map<string, (payload?: unknown) => void>();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    on: (channel: string, listener: (payload?: unknown) => void) => {
      mockOn(channel, listener);
      mockChannelListeners.set(channel, listener);
      return () => {
        mockChannelListeners.delete(channel);
      };
    },
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/channels', () => ({
  DESKTOP_RUNTIME_ON_CHANNELS: {
    CONVERSATION_EVENT: 'windie:conversation-event',
    PENDING_TURN: 'windie:pending-turn',
    CURRENT_TURN: 'windie:current-turn',
    ROWS: 'windie:rows',
  },
}));

import {
  DesktopConversationRuntimeEventClient,
} from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient';
import * as DesktopConversationRuntimeEventModule from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient';

const currentTurn = {
  conversationRef: 'conv-1',
  turnRef: 'turn-1',
  phase: 'streaming',
  userMessageRowId: 'user-row',
  assistantText: 'Hello',
  reasoningText: null,
  toolEvents: [],
  lastError: null,
  presentation: {
    entries: [],
    typingVisible: false,
    overlayVisible: true,
    hasVisibleContent: true,
  },
};

const displayRow = {
  id: 'row-1',
  conversationRef: ' conv-1 ',
  turnRef: 'turn-1',
  index: 0,
  role: 'assistant',
  type: 'assistant_message',
  content: 'Hello',
};

describe('DesktopConversationRuntimeEventClient', () => {
  beforeEach(() => {
    mockOn.mockClear();
    mockChannelListeners = new Map();
  });

  test('current-turn subscriptions emit normalized events', () => {
    expect(DesktopConversationRuntimeEventModule).not.toHaveProperty('normalizeCurrentTurnProjectionEvent');
    const events: unknown[] = [];
    const unsubscribe = DesktopConversationRuntimeEventClient.onCurrentTurnProjection((event) => {
      events.push(event);
    });

    mockChannelListeners.get('windie:current-turn')?.(currentTurn);
    mockChannelListeners.get('windie:current-turn')?.({
      conversationRef: ' override-conv ',
      currentTurn,
    });
    mockChannelListeners.get('windie:current-turn')?.({ currentTurn: { phase: 'streaming' } });

    expect(mockOn).toHaveBeenCalledWith('windie:current-turn', expect.any(Function));
    expect(events).toEqual([
      {
        currentTurn,
        conversationRef: 'conv-1',
      },
      {
        currentTurn,
        conversationRef: 'override-conv',
      },
      {
        currentTurn: null,
        conversationRef: null,
      },
    ]);

    unsubscribe?.();
    expect(mockChannelListeners.has('windie:current-turn')).toBe(false);
  });

  test('display-row subscriptions emit normalized events', () => {
    expect(DesktopConversationRuntimeEventModule).not.toHaveProperty('normalizeDisplayRowsProjectionEvent');
    const events: unknown[] = [];
    const unsubscribe = DesktopConversationRuntimeEventClient.onDisplayRowsProjection((event) => {
      events.push(event);
    });

    mockChannelListeners.get('windie:rows')?.([displayRow]);
    mockChannelListeners.get('windie:rows')?.([{ id: 'row-1' }]);

    expect(mockOn).toHaveBeenCalledWith('windie:rows', expect.any(Function));
    expect(events).toEqual([
      {
        rows: [displayRow],
        conversationRef: 'conv-1',
      },
      {
        rows: [],
        conversationRef: null,
      },
    ]);

    unsubscribe?.();
    expect(mockChannelListeners.has('windie:rows')).toBe(false);
  });

  test('pending-turn subscriptions emit normalized broadcast actions', () => {
    const actions: unknown[] = [];
    const unsubscribe = DesktopConversationRuntimeEventClient.onPendingTurn((action) => {
      actions.push(action);
    });

    mockChannelListeners.get('windie:pending-turn')?.({
      type: 'pending',
      pendingTurn: { conversationRef: 'conv-1', turnRef: 'turn-1' },
    });
    mockChannelListeners.get('windie:pending-turn')?.({
      type: 'clear',
      conversationRef: ' conv-1 ',
      turnRef: ' turn-1 ',
    });
    mockChannelListeners.get('windie:pending-turn')?.(null);

    expect(mockOn).toHaveBeenCalledWith('windie:pending-turn', expect.any(Function));
    expect(actions).toEqual([
      {
        kind: 'pending',
        pendingTurn: { conversationRef: 'conv-1', turnRef: 'turn-1' },
      },
      {
        kind: 'clear',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
      },
      {
        kind: 'pending',
        pendingTurn: undefined,
      },
    ]);

    unsubscribe?.();
    expect(mockChannelListeners.has('windie:pending-turn')).toBe(false);
  });
});
