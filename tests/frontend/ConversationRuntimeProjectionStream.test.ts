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
  useChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  acceptPendingTurnInChatStore,
} from '../../frontend/src/renderer/features/chat/stores/chatStoreAdapters';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/channels';

describe('useConversationRuntimeProjectionStream display row merging', () => {
  beforeEach(() => {
    resetChatStreamTestState();
    setMockActiveConversationRef('conv-1');
  });

  test('does not subscribe to raw display-row projection events', () => {
    const { handlers } = registerBackendAndProjectionListeners();

    expect(handlers[DESKTOP_RUNTIME_ON_CHANNELS.ROWS]).toBeUndefined();
  });

  test('applies SDK current-turn projection atomically with pending-turn replacement', () => {
    acceptPendingTurnInChatStore({
      conversationRef: 'conv-1',
      turnRef: 'turn-new',
      userMessageId: 'turn-new-sdk-evt-000002-user_message',
      text: 'edited first question',
      timestamp: '2026-06-23T00:00:00.000Z',
      attachmentFilenames: null,
    });
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    const observedSnapshots: Array<{
      workspaceTurnRef: string | null;
      pendingTurnRef: string | null;
    }> = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      const workspace = state.getWorkspaceState('conv-1');
      observedSnapshots.push({
        workspaceTurnRef: workspace.currentTurnProjection?.turnRef ?? null,
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
    expect(workspace.currentTurnProjection).toEqual(expect.objectContaining({
      turnRef: 'turn-new',
    }));
    expect(workspace.pendingTurn).toBeNull();
  });
});
