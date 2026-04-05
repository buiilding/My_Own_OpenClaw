import { act } from '@testing-library/react';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  registerBackendListener,
  renderBackendListenerWithSpy,
  resetChatStreamTestState,
  setMockActiveConversationRef,
  setMockConfig,
  transcriptSpies,
} from './ChatStreamThinkingStatus.testUtils';

describe('useChatStream transcript + event filtering', () => {
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
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          tool_name: 'read_file',
          parameters: { file_path: '/tmp/a' },
        },
      });
    });

    expect(transcriptSpies.recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        modelId: 'updated-model',
        modelProvider: 'updated-provider',
      }),
    );
  });

  test('writes tool-output transcript with correlation fallback from metadata', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-output',
        id: 'event-1',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          tool_name: 'read_file',
          success: true,
          output: 'done',
          metadata: { request_id: 'meta-corr' },
        },
      });
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last).toEqual(
      expect.objectContaining({
        type: 'tool-output',
        correlationId: 'meta-corr',
      }),
    );
    expect(transcriptSpies.recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        correlationId: 'meta-corr',
      }),
    );
  });

  test('streaming-complete marks assistant message complete and records transcript', () => {
    setMockActiveConversationRef('conv-1');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.getState().setMessages([
        {
          id: 'user-1',
          text: 'hi',
          sender: 'user',
          turnRef: 'turn-1',
          systemPrompt: {
            content: 'system prompt text',
            toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
          },
          fullUserMessage: {
            content: '<user_query>hi</user_query>',
            metadata: { source: 'user-message-full' },
          },
        },
        {
          id: 'assistant-1',
          text: 'answer',
          sender: 'assistant',
          type: 'llm-text',
          isComplete: false,
          turnRef: 'turn-1',
          fullAssistantMessage: {
            content: 'raw assistant completion',
          },
        },
      ], 'conv-1');
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-1',
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages.at(-1)).toEqual(
      expect.objectContaining({ id: 'assistant-1', isComplete: true }),
    );
    expect(transcriptSpies.recordAssistantMessage).toHaveBeenCalledWith(
      'answer',
      expect.objectContaining({
        conversationRef: 'conv-1',
        userId: 'user-1',
        transparency: {
          systemPrompt: 'system prompt text',
          toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
          fullUserMessage: {
            content: '<user_query>hi</user_query>',
            metadata: { source: 'user-message-full' },
          },
          fullAssistantMessage: {
            content: 'raw assistant completion',
          },
        },
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
        text: 'backend full reply',
        isComplete: true,
      }),
    );
    expect(transcriptSpies.recordAssistantMessage).toHaveBeenCalledWith(
      'backend full reply',
      expect.objectContaining({
        conversationRef: 'conv-1',
        userId: 'user-1',
      }),
    );
  });

  test('duplicate streaming-complete does not duplicate assistant transcript writes', () => {
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
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-1',
      });
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
        turn_ref: 'turn-1',
      });
    });

    expect(useChatStore.getState().getWorkspaceState('conv-1').messages.at(-1)).toEqual(
      expect.objectContaining({ id: 'assistant-1', isComplete: true }),
    );
    expect(transcriptSpies.recordAssistantMessage).toHaveBeenCalledTimes(1);
  });

  test('stale streaming-complete turn does not complete active assistant message or write transcript', () => {
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
    expect(transcriptSpies.recordAssistantMessage).not.toHaveBeenCalled();
  });

  test('does not write transcript entries when transcript is disabled', () => {
    const { emitBackendEvent } = registerBackendListener(false);

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: { tool_name: 'read_file', parameters: { file_path: '/tmp/a' } },
      });
    });

    expect(transcriptSpies.recordToolMessage).not.toHaveBeenCalled();
    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('promotes active conversation for local-user events even when transcript is disabled', () => {
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

  test('handles tool-bundle events and persists bundle transcript rows', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-bundle',
        session_id: 'session-1',
        user_id: 'user-1',
        payload: {
          bundle_id: 'bundle-1',
          tools: [{ name: 'read_file', args: { file_path: '/tmp/a' } }],
        },
      });
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last).toEqual(
      expect.objectContaining({
        sender: 'assistant',
        type: 'tool-call',
        sourceEventType: 'tool-bundle',
      }),
    );
    expect(transcriptSpies.recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messageType: 'tool-bundle',
        toolName: 'tool-bundle',
        correlationId: 'bundle-1',
      }),
    );
  });

  test('ignores non-backend events entirely', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({ type: 'not-a-real-event' });
    });

    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('updates transcript session on each valid backend event when enabled', () => {
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

    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith('conv-2', 'user-2');
  });

  test('tracks memory-store events without renderer-side persistence side effects', async () => {
    const { emitBackendEvent } = registerBackendListener();

    await act(async () => {
      emitBackendEvent({
        type: 'memory-store',
        user_id: 'user-9',
        session_id: 'session-9',
        payload: {
          user_query: 'hi',
          assistant_response: 'hello',
          memory_type: 'episodic',
          user_id: 'user-9',
          session_id: 'session-9',
        },
      });
      await Promise.resolve();
    });

    const tracking = useChatStore.getState().getWorkspaceState('session-9').streamTracking;
    expect(tracking.lastEventType).toBe('memory-store');
  });

  test('routes non-active conversation events into their own workspace', () => {
    setMockActiveConversationRef('conv-active');
    const { emitBackendEvent } = registerBackendListener();
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
    });

    const activeAfter = useChatStore.getState().getWorkspaceState('conv-active');
    const staleWorkspace = useChatStore.getState().getWorkspaceState('conv-stale');
    expect(activeAfter).toEqual(activeBefore);
    expect(staleWorkspace.messages.at(-1)).toEqual(
      expect.objectContaining({
        text: 'stale chunk',
        sender: 'assistant',
        type: 'llm-text',
      }),
    );
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith('conv-active', undefined);
  });

  test('tracks stale memory-store events in their own workspace without switching active transcript', async () => {
    setMockActiveConversationRef('conv-active');
    const { emitBackendEvent } = registerBackendListener();

    await act(async () => {
      emitBackendEvent({
        type: 'memory-store',
        payload: {
          user_query: 'hi',
          assistant_response: 'hello',
          memory_type: 'episodic',
          session_id: 'conv-stale',
          user_id: 'user-1',
        },
      });
      await Promise.resolve();
    });

    const staleTracking = useChatStore.getState().getWorkspaceState('conv-stale').streamTracking;
    expect(staleTracking.lastEventType).toBe('memory-store');
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith('conv-active', undefined);
  });

  test('still processes events that omit conversation_ref for compatibility', () => {
    setMockActiveConversationRef('conv-active');
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
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

    expect(useChatStore.getState().getWorkspaceState('conv-active').tokenCounts).toEqual(
      expect.objectContaining({
        prompt_tokens: 1,
        visible_output_tokens: 1,
      }),
    );
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith('conv-active', undefined);
  });

  test('preserves transcript session refs when backend event omits conversation and user ids', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } }],
        },
      });
    });

    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledTimes(1);
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith(undefined, undefined);
  });
});
