/**
 * Covers conversation runtime projection stream transcript merging.
 */

import { act } from '@testing-library/react';
import {
  registerBackendAndProjectionListeners,
  resetChatStreamTestState,
  setMockActiveConversationRef,
} from './ChatStreamThinkingStatus.testUtils';
import {
  selectChatInterfaceState,
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  acceptPendingTurnInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';

describe('useConversationRuntimeProjectionStream display row merging', () => {
  beforeEach(() => {
    resetChatStreamTestState();
    setMockActiveConversationRef('conv-1');
  });

  test('does not subscribe to raw display-row projection events', () => {
    const { handlers } = registerBackendAndProjectionListeners();

    expect(handlers[DESKTOP_RUNTIME_ON_CHANNELS.ROWS]).toBeUndefined();
  });

  test('applies ConversationView carried by current-turn projection events', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-1',
      turnRef: 'turn-retry',
      userMessageId: 'turn-retry-sdk-evt-000002-user_message',
      text: 'retry the answer',
      timestamp: '2026-06-23T00:00:00.000Z',
    });
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    const conversationView = {
      conversationRef: 'conv-1',
      revisionId: 'rev-retry',
      displayRows: [{
        id: 'turn-retry-sdk-evt-000002-user_message',
        conversationRef: 'conv-1',
        turnRef: 'turn-retry',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'retry the answer',
      }],
      liveTurn: {
        turnRef: 'turn-retry',
        phase: 'streaming',
        entries: [{
          id: 'entry-assistant',
          type: 'llm-text',
          text: 'retry response',
        }],
        isBusy: true,
        isTerminal: false,
        canStop: true,
        lastError: null,
      },
      surfaces: {
        pill: { mode: 'busy' },
        dashboard: { mode: 'busy' },
        responseOverlay: {
          mode: 'response',
          visible: true,
          guardRef: 'turn-retry',
          ownerConversationRef: 'conv-1',
          turnRef: 'turn-retry',
        },
      },
      actions: {
        canEdit: true,
        canRetry: false,
        canFork: true,
      },
    };

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-1',
        currentTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-retry',
          phase: 'streaming',
          assistantText: 'retry response',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            entries: [{
              id: 'entry-assistant',
              type: 'llm-text',
              text: 'retry response',
            }],
          },
        },
        view: conversationView,
      });
    });

    const workspace = useChatStore.getState().getWorkspaceState('conv-1');
    expect(workspace.conversationView).toBe(conversationView);
    expect(workspace.pendingTurn).toBeNull();
    expect(workspace.sdkLiveTurn).toBeNull();
  });

  test('keeps pending user row visible through awaiting current-turn projection without view rows', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-1',
      turnRef: 'turn-awaiting',
      userMessageId: 'turn-awaiting-sdk-evt-000002-user_message',
      text: 'normal dashboard send',
      timestamp: '2026-06-26T00:00:00.000Z',
    });
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-1',
        currentTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-awaiting',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
          presentation: {
            phase: 'awaiting',
            entries: [],
            isBusy: true,
            isTerminal: false,
            awaitingAnchor: {
              kind: 'user-message',
              rowId: 'turn-awaiting-sdk-evt-000002-user_message',
            },
          },
        },
      });
    });

    const storeState = useChatStore.getState();
    const workspace = storeState.getWorkspaceState('conv-1');
    expect(workspace.pendingTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-awaiting',
    }));
    expect(selectChatInterfaceState(storeState).renderedMessages).toEqual([
      expect.objectContaining({
        id: 'turn-awaiting-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'normal dashboard send',
      }),
    ]);
  });

  test('applies SDK current-turn projection atomically with pending-turn replacement', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'turn-new-sdk-evt-000002-user_message',
      text: 'edited first question',
      timestamp: '2026-06-23T00:00:00.000Z',
    });
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    const observedSnapshots: Array<{
      workspaceTurnRef: string | null;
      pendingTurnRef: string | null;
    }> = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      const workspace = state.getWorkspaceState('conv-1');
      observedSnapshots.push({
        workspaceTurnRef: workspace.sdkLiveTurn?.turnRef ?? null,
        pendingTurnRef: workspace.pendingTurn?.turnRef ?? null,
      });
    });

    try {
      act(() => {
        emitConversationRuntimeUpdated({
          conversationRef: 'conv-1',
          currentTurn: {
            conversationRef: 'conv-1',
            turnRef: 'turn-new',
            phase: 'streaming',
            assistantText: 'streaming answer',
            reasoningText: null,
            toolEvents: [],
            lastError: null,
            presentation: {
              entries: [{
                id: 'entry-assistant',
                type: 'llm-text',
                text: 'streaming answer',
              }],
            },
          },
        });
      });
    } finally {
      unsubscribe();
    }

    expect(observedSnapshots).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceTurnRef: 'turn-new',
          pendingTurnRef: 'turn-new',
        }),
      ]),
    );
    const state = useChatStore.getState();
    const workspace = state.getWorkspaceState('conv-1');
    expect(state).not.toHaveProperty('latestCurrentTurnProjection');
    expect(workspace.sdkLiveTurn).toEqual(expect.objectContaining({
      turnRef: 'turn-new',
    }));
    expect(workspace.pendingTurn).toBeNull();
  });
});
