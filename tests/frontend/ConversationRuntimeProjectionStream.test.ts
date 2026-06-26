/**
 * Covers conversation runtime projection stream transcript merging.
 */

import { act } from '@testing-library/react';
import {
  registerBackendAndProjectionListeners,
  resetChatStreamTestState,
  setMockActiveConversationRef,
} from './ChatStreamThinkingStatus.testUtils';
import type { ChatMessage } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import type { ConversationView } from '../../frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts';

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: overrides.id ?? 'message-id',
    sender: overrides.sender ?? 'assistant',
    text: overrides.text ?? '',
    ...overrides,
  };
}

describe('useConversationRuntimeProjectionStream display row merging', () => {
  beforeEach(() => {
    resetChatStreamTestState();
    setMockActiveConversationRef('conv-1');
  });

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
    useChatStore.getState().setMessages([optimisticUser], 'conv-1');
    const { emitDisplayRows } = registerBackendAndProjectionListeners();

    act(() => {
      emitDisplayRows([{
        id: 'tool-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'tool_call',
        content: {
          id: 'call-1',
          name: 'read_file',
          arguments: {
            path: 'CHANGELOG.md',
          },
        },
        metadata: {
          toolName: 'read_file',
          requestId: 'request-1',
        },
      }]);
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages).toEqual([
      optimisticUser,
      expect.objectContaining({
        id: 'tool-row',
        sender: 'assistant',
        type: 'tool-call',
        turnRef: 'turn-1',
        sourceEventType: 'tool_call',
      }),
    ]);
  });

  test('does not write display-row messages after ConversationView exists', () => {
    const existingMessage = message({
      id: 'existing-local-row',
      sender: 'user',
      text: 'still local bridge',
      turnRef: 'turn-1',
    });
    const conversationView: ConversationView = {
      conversationRef: 'conv-1',
      revisionId: 'revision-1',
      displayRows: [],
      liveTurn: {
        turnRef: null,
        phase: 'idle',
        entries: [],
        isBusy: false,
        isTerminal: false,
        canStop: false,
        lastError: null,
      },
      surfaces: {
        pill: { mode: 'idle' },
        dashboard: { mode: 'idle' },
        responseOverlay: {
          mode: 'hidden',
          visible: false,
          guardRef: null,
          ownerConversationRef: 'conv-1',
          turnRef: null,
        },
      },
      actions: {
        canEdit: true,
        canRetry: true,
        canFork: true,
      },
    };

    useChatStore.getState().setMessages([existingMessage], 'conv-1');
    useChatStore.getState().setConversationView(conversationView, 'conv-1');
    const { emitDisplayRows } = registerBackendAndProjectionListeners();

    act(() => {
      emitDisplayRows([{
        id: 'assistant-row',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'assistant',
        type: 'assistant_message',
        content: 'sdk display row should not become store messages',
      }]);
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages).toEqual([existingMessage]);
  });

  test('does not copy optimistic attachments once sdk projects a text-only same-turn user row', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect recent commits',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
      attachments: [{
        id: 'turn-1:attachment:000',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,inline-optimistic-base64',
      }],
    });

    useChatStore.getState().setMessages([optimisticUser], 'conv-1');
    const { emitDisplayRows } = registerBackendAndProjectionListeners();

    act(() => {
      emitDisplayRows([{
        id: 'turn-1-sdk-evt-000002-user_message',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'inspect recent commits',
      }]);
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages).toEqual([
      expect.objectContaining({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'inspect recent commits',
        isComplete: true,
      }),
    ]);
    expect(useChatStore.getState().getWorkspaceState('conv-1').messages[0]).not.toHaveProperty('attachments');
    expect(useChatStore.getState().getWorkspaceState('conv-1').messages[0]).not.toEqual(
      expect.objectContaining({
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    );
  });

  test('replaces optimistic user row with sdk row carrying display attachments', () => {
    const optimisticUser = message({
      id: 'turn-1-sdk-evt-000002-user_message',
      sender: 'user',
      text: 'inspect the screen',
      turnRef: 'turn-1',
      sourceEventType: 'renderer-compose',
      sourceChannel: 'renderer-local',
      isComplete: true,
      attachments: [{
        id: 'turn-1:attachment:000',
        kind: 'image',
        source: 'user_included',
        status: 'materializing',
        previewSrc: 'data:image/png;base64,inline-optimistic-base64',
      }],
    });

    useChatStore.getState().setMessages([optimisticUser], 'conv-1');
    const { emitDisplayRows } = registerBackendAndProjectionListeners();

    act(() => {
      emitDisplayRows([{
        id: 'turn-1-sdk-evt-000002-user_message',
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        index: 0,
        role: 'user',
        type: 'user_message',
        content: 'inspect the screen',
        metadata: {
          attachments: [{
            id: 'turn-1:attachment:000',
            kind: 'image',
            source: 'camera_button',
            status: 'ready',
            screenshotRef: 'artifact-screen-1',
          }],
        },
      }]);
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages).toEqual([
      expect.objectContaining({
        id: 'turn-1-sdk-evt-000002-user_message',
        sender: 'user',
        text: 'inspect the screen',
        attachments: [
          expect.objectContaining({
            screenshotRef: 'artifact-screen-1',
          }),
        ],
      }),
    ]);
    expect(useChatStore.getState().getWorkspaceState('conv-1').messages[0]).not.toEqual(
      expect.objectContaining({
        sourceEventType: 'renderer-compose',
        sourceChannel: 'renderer-local',
      }),
    );
    expect(useChatStore.getState().getWorkspaceState('conv-1').messages[0]).not.toEqual(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            previewSrc: 'data:image/png;base64,inline-optimistic-base64',
          }),
        ],
      }),
    );
  });

  test('applies SDK current-turn projection atomically with pending-turn replacement', () => {
    useChatStore.getState().acceptPendingTurn({
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
