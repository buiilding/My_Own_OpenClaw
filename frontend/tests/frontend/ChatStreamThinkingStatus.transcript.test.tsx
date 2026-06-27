/**
 * Covers chat stream thinking status.transcript. behavior in the frontend test suite.
 */

import { act } from '@testing-library/react';
import {
  selectChatInterfaceState,
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  setConversationViewInChatStore,
  setNoViewSdkLiveTurnInChatStore,
  setMessagesInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import {
  getActiveWorkspaceStateForTest,
  registerBackendAndProjectionListeners,
  registerBackendListener,
  renderBackendListenerWithSpy,
  resetChatStreamTestState,
  setMockActiveConversationRef,
  setMockConfig,
  transcriptSpies,
} from './ChatStreamThinkingStatus.testUtils';

describe('useChatStream live SDK event ownership', () => {
  beforeEach(() => {
    resetChatStreamTestState();
  });

  test('uses latest model metadata without re-subscribing conversation event listener', () => {
    const { rerender, onSpy, emitBackendEvent } = renderBackendListenerWithSpy(true);

    expect(onSpy).toHaveBeenCalledTimes(1);

    setMockConfig({
      selected_model_id: 'updated-model',
      model_provider: 'updated-provider',
    });

    rerender({ shouldEnableTranscript: true });

    expect(onSpy).toHaveBeenCalledTimes(1);

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
        },
      });
    });

    expect(onSpy).toHaveBeenCalledTimes(1);
  });

  test('streaming-complete updates terminal state without materializing assistant rows', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setMessagesInChatStore([
        {
          id: 'user-1',
          text: 'hi',
          sender: 'user',
          turnRef: 'turn-1',
        },
        {
          id: 'assistant-1',
          text: 'answer',
          sender: 'assistant',
          type: 'llm-text',
          isComplete: false,
          turnRef: 'turn-1',
        },
      ], 'conv-1');
      setNoViewSdkLiveTurnInChatStore({
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'complete',
        assistantText: 'answer',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      }, 'conv-1');
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-1',
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages.at(-1)).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        text: 'answer',
        isComplete: false,
      }),
    );
  });

  test('ConversationView display rows preserve screenshot tool rows when the next turn replaces currentTurn', () => {
    setMockActiveConversationRef('conv-1');
    useChatStore.getState().setActiveConversationRef('conv-1');
    const { emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();

    act(() => {
      setConversationViewInChatStore({
        conversationRef: 'conv-1',
        revisionId: 'revision-1',
        displayRows: [
          {
            id: 'user-1',
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            index: 0,
            role: 'user',
            type: 'user_message',
            content: 'take a screenshot',
          },
          {
            id: 'tool-call-row-1',
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            index: 1,
            role: 'assistant',
            type: 'tool_call',
            content: {
              id: 'call-screenshot-1',
              name: 'screenshot',
              arguments: {
                explanation: 'Capture the screen.',
              },
            },
            metadata: {
              toolName: 'screenshot',
              requestId: 'request-screenshot-1',
              raw: {
                args: {
                  explanation: 'Capture the screen.',
                },
              },
            },
          },
          {
            id: 'tool-output-row-1',
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            index: 2,
            role: 'tool',
            type: 'tool_output',
            content: 'Screenshot captured successfully.',
            metadata: {
              toolName: 'screenshot',
              requestId: 'request-screenshot-1',
              raw: {
                output: 'Screenshot captured successfully.',
                success: true,
              },
            },
          },
          {
            id: 'conv-1:turn-1:assistant',
            conversationRef: 'conv-1',
            turnRef: 'turn-1',
            index: 3,
            role: 'assistant',
            type: 'assistant_message',
            content: 'Done.',
          },
        ],
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
      }, 'conv-1');
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-1',
        currentTurn: {
          conversationRef: 'conv-1',
          turnRef: 'turn-2',
          phase: 'awaiting',
          assistantText: '',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    const renderedMessages = selectChatInterfaceState(useChatStore.getState()).renderedMessages;
    expect(renderedMessages).toEqual([
      expect.objectContaining({
        id: 'user-1',
        sender: 'user',
      }),
      expect.objectContaining({
        id: 'tool-call-row-1',
        sender: 'assistant',
        type: 'tool-call',
        turnRef: 'turn-1',
      }),
      expect.objectContaining({
        id: 'tool-output-row-1',
        sender: 'assistant',
        type: 'tool-output',
        turnRef: 'turn-1',
        text: 'Screenshot captured successfully.',
      }),
      expect.objectContaining({
        id: 'conv-1:turn-1:assistant',
        sender: 'assistant',
        type: 'llm-text',
        text: 'Done.',
        isComplete: true,
      }),
    ]);

    const messageIds = renderedMessages.map((message) => message.id);
    expect(messageIds).toEqual([
      'user-1',
      'tool-call-row-1',
      'tool-output-row-1',
      'conv-1:turn-1:assistant',
    ]);
  });

  test('streaming-complete does not synthesize empty assistant placeholders from final response payload', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setMessagesInChatStore([
        {
          id: 'user-1',
          text: 'hi',
          sender: 'user',
          turnRef: 'turn-1',
        },
        {
          id: 'assistant-1',
          text: '',
          sender: 'assistant',
          type: 'llm-text',
          isComplete: false,
          turnRef: 'turn-1',
          fullAssistantMessage: {
            content: 'backend full reply',
          },
        },
      ], 'conv-1');
      setNoViewSdkLiveTurnInChatStore({
        conversationRef: 'conv-1',
        turnRef: 'turn-1',
        phase: 'complete',
        assistantText: 'backend full reply',
        reasoningText: null,
        toolEvents: [],
        lastError: null,
      }, 'conv-1');
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-1',
        payload: {
          final_response: 'backend full reply',
        },
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages.at(-1)).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        text: '',
        isComplete: false,
      }),
    );
  });

  test('stale streaming-complete turn does not complete active assistant message', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      setMessagesInChatStore([
        {
          id: 'user-1',
          text: 'new question',
          sender: 'user',
          turnRef: 'turn-new',
        },
        {
          id: 'assistant-1',
          text: 'partial answer',
          sender: 'assistant',
          type: 'llm-text',
          isComplete: false,
          turnRef: 'turn-new',
        },
      ], 'conv-1');
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-old',
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages.at(-1)).toEqual(
      expect.objectContaining({ id: 'assistant-1', isComplete: false }),
    );
  });

  test('does not sync transcript session when transcript sync is disabled', () => {
    const { emitBackendEvent } = registerBackendListener(false);

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: { tool_name: 'read_file', parameters: { file_path: '/tmp/a' } },
      });
    });

    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('promotes active conversation for local-user events even when transcript sync is disabled', () => {
    const { emitBackendEvent } = registerBackendListener(false);

    act(() => {
      emitBackendEvent({
        type: 'local-user-message',
        conversation_ref: 'conv-overlay',
        user_id: 'user-1',
        turn_ref: 'turn-overlay',
        payload: { text: 'overlay prompt' },
      });
    });

    expect(useChatStore.getState().activeConversationRef).toBe('conv-overlay');
    expect(getActiveWorkspaceStateForTest().messages.at(-1)).not.toEqual(
      expect.objectContaining({
        text: 'overlay prompt',
        sourceEventType: 'local-user-message',
      }),
    );
    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('updates transcript session on valid SDK events when enabled', () => {
    setMockActiveConversationRef('conv-2');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'token-count',
        conversation_ref: 'conv-2',
        user_id: 'user-2',
        payload: {
          prompt_tokens: 2,
          visible_output_tokens: 2,
          thinking_tokens: 1,
          output_tokens_total: 3,
          total_tokens: 5,
          conversation_tokens: 5,
          usage_source: 'provider',
        },
      });
    });

    expect(transcriptSpies.updateTranscriptSession.mock.calls.some(([conversationRef, userId]) => (
      conversationRef === 'conv-2' && userId === 'user-2'
    ))).toBe(true);
  });

  test('routes non-active conversation events into their own workspace', () => {
    setMockActiveConversationRef('conv-active');
    const { emitBackendEvent, emitConversationRuntimeUpdated } = registerBackendAndProjectionListeners();
    setMessagesInChatStore([
      {
        id: 'active-assistant-1',
        text: 'active',
        sender: 'assistant',
      },
    ], 'conv-active');
    const activeBefore = useChatStore.getState().getWorkspaceState('conv-active');

    act(() => {
      emitBackendEvent({
        type: 'streaming-response',
        conversation_ref: 'conv-stale',
        payload: { text: 'stale chunk' },
      });
      emitConversationRuntimeUpdated({
        conversationRef: 'conv-stale',
        currentTurn: {
          conversationRef: 'conv-stale',
          turnRef: 'turn-stale',
          phase: 'streaming',
          assistantText: 'stale chunk',
          reasoningText: null,
          toolEvents: [],
          lastError: null,
        },
      });
    });

    const activeAfter = useChatStore.getState().getWorkspaceState('conv-active');
    const staleWorkspace = useChatStore.getState().getWorkspaceState('conv-stale');
    expect(activeAfter).toEqual(activeBefore);
    expect(staleWorkspace.messages).toEqual([]);
    expect(staleWorkspace.streamTracking).toEqual(expect.objectContaining({
      lastEventType: 'streaming-response',
      phase: 'streaming',
    }));
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith('conv-active', undefined);
  });

  test('quarantines events that omit conversation_ref', () => {
    setMockActiveConversationRef('conv-active');
    const { emitRawBackendEvent } = registerBackendListener();

    act(() => {
      emitRawBackendEvent({
        type: 'token-count',
        payload: {
          prompt_tokens: 1,
          visible_output_tokens: 1,
          output_tokens_total: 1,
          total_tokens: 2,
          conversation_tokens: 2,
          usage_source: 'provider',
        },
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-active').tokenCounts).not.toEqual(
      expect.objectContaining({
        prompt_tokens: 1,
        visible_output_tokens: 1,
      }),
    );
    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
  });
});
