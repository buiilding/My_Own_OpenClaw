import { act } from '@testing-library/react';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
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

  test('uses latest model metadata without re-subscribing backend listener', () => {
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

  test('streaming-complete materializes assistant display without renderer persistence', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.getState().setMessages([
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
      useChatStore.getState().setCurrentTurnProjection({
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
        id: 'conv-1:turn-1:assistant',
        text: 'answer',
        isComplete: true,
        sourceChannel: 'windie:current-turn',
      }),
    );
  });

  test('streaming-complete materializes empty assistant placeholder from final response payload', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.getState().setMessages([
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
      useChatStore.getState().setCurrentTurnProjection({
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
        id: 'conv-1:turn-1:assistant',
        text: 'backend full reply',
        isComplete: true,
      }),
    );
  });

  test('stale streaming-complete turn does not complete active assistant message', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.getState().setMessages([
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
    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({
        sender: 'user',
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
    useChatStore.getState().setMessages([
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
