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

const presentationOnlyCurrentTurn = {
  conversationRef: 'conv-2',
  turnRef: 'turn-2',
  phase: 'streaming',
  presentation: {
    entries: [
      { id: 'entry-1', type: 'llm-text', text: 'Hello from presentation' },
    ],
    typingVisible: true,
    overlayVisible: true,
    hasVisibleContent: true,
  },
};

const conversationView = {
  conversationRef: 'conv-view',
  displayRows: [{
    id: 'row-1',
    conversationRef: 'conv-view',
    role: 'user',
    type: 'user_message',
    content: 'hello',
  }],
  liveTurn: {
    turnRef: 'turn-view',
    phase: 'idle',
    entries: [],
    isBusy: false,
    isTerminal: true,
  },
  surfaces: {
    pill: { mode: 'idle' },
    dashboard: { mode: 'idle' },
    responseOverlay: {
      mode: 'hidden',
      visible: false,
    },
  },
  actions: {},
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
    mockChannelListeners.get('windie:current-turn')?.({
      conversationRef: 'missing-current-turn ',
      currentTurn: null,
    });
    const paddedCurrentTurn = {
      ...currentTurn,
      conversationRef: ' conv-padded-current-turn ',
    };
    mockChannelListeners.get('windie:current-turn')?.(paddedCurrentTurn);
    mockChannelListeners.get('windie:current-turn')?.({
      currentTurn: presentationOnlyCurrentTurn,
    });
    mockChannelListeners.get('windie:current-turn')?.({ currentTurn: { phase: 'streaming' } });
    mockChannelListeners.get('windie:current-turn')?.({
      conversationRef: ' conv-view ',
      currentTurn: null,
      view: conversationView,
    });
    mockChannelListeners.get('windie:current-turn')?.({
      currentTurn: null,
      view: conversationView,
    });
    mockChannelListeners.get('windie:current-turn')?.({
      conversationRef: 'conv-partial',
      currentTurn: null,
      view: {
        conversationRef: 'conv-partial',
        displayRows: [],
        liveTurn: {},
        surfaces: {},
      },
    });

    expect(mockOn).toHaveBeenCalledWith('windie:current-turn', expect.any(Function));
    expect(events).toEqual([
      {
        currentTurn,
        conversationRef: 'conv-1',
        view: null,
      },
      {
        currentTurn,
        conversationRef: 'conv-1',
        view: null,
      },
      {
        currentTurn: null,
        conversationRef: null,
        view: null,
      },
      {
        currentTurn: paddedCurrentTurn,
        conversationRef: null,
        view: null,
      },
      {
        currentTurn: presentationOnlyCurrentTurn,
        conversationRef: 'conv-2',
        view: null,
      },
      {
        currentTurn: null,
        conversationRef: null,
        view: null,
      },
      {
        currentTurn: null,
        conversationRef: 'conv-view',
        view: conversationView,
      },
      {
        currentTurn: null,
        conversationRef: 'conv-view',
        view: conversationView,
      },
      {
        currentTurn: null,
        conversationRef: 'conv-partial',
        view: null,
      },
    ]);

    unsubscribe?.();
    expect(mockChannelListeners.has('windie:current-turn')).toBe(false);
  });

  test('does not expose display-row projection subscriptions', () => {
    expect(DesktopConversationRuntimeEventModule).not.toHaveProperty('normalizeDisplayRowsProjectionEvent');
    expect(DesktopConversationRuntimeEventClient).not.toHaveProperty('onDisplayRows');
    expect(DesktopConversationRuntimeEventClient).not.toHaveProperty('onDisplayRowsProjection');
  });

  test('does not expose raw current-turn subscriptions', () => {
    expect(DesktopConversationRuntimeEventClient).not.toHaveProperty('onCurrentTurn');
  });

  test('pending-turn subscriptions emit normalized broadcast actions', () => {
    const actions: unknown[] = [];
    const unsubscribe = DesktopConversationRuntimeEventClient.onPendingTurn((action) => {
      actions.push(action);
    });

    mockChannelListeners.get('windie:pending-turn')?.({
      type: 'pending',
      pendingTurn: {
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        userMessageId: 'user-1',
        text: 'pending prompt',
        timestamp: '2026-06-27T00:00:00.000Z',
      },
    });
    mockChannelListeners.get('windie:pending-turn')?.({
      type: 'clear',
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
    });
    mockChannelListeners.get('windie:pending-turn')?.(null);

    expect(mockOn).toHaveBeenCalledWith('windie:pending-turn', expect.any(Function));
    expect(actions).toEqual([
      {
        kind: 'pending',
        pendingTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-1',
          userMessageId: 'user-1',
          text: 'pending prompt',
          timestamp: '2026-06-27T00:00:00.000Z',
        },
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
