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
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', text: 'hi', sender: 'user' },
          {
            id: 'assistant-1',
            text: 'answer',
            sender: 'assistant',
            type: 'llm-text',
            isComplete: false,
          },
        ],
      });
      emitBackendEvent({
        type: 'streaming-complete',
        conversation_ref: 'conv-1',
        user_id: 'user-1',
      });
    });

    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({ id: 'assistant-1', isComplete: true }),
    );
    expect(transcriptSpies.recordAssistantMessage).toHaveBeenCalledWith(
      'answer',
      expect.objectContaining({
        conversationRef: 'conv-1',
        userId: 'user-1',
      }),
    );
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

  test('handles tool-bundle events and records transcript metadata', () => {
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
      }),
    );
    expect(transcriptSpies.recordToolMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        messageType: 'tool-call',
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

  test('ignores stale events when conversation_ref does not match active conversation', () => {
    setMockActiveConversationRef('conv-active');
    const { emitBackendEvent } = registerBackendListener();
    useChatStore.setState({
      streamTracking: {
        ...useChatStore.getState().streamTracking,
        activeTurnRef: 'turn-active',
        phase: 'streaming',
      },
    });
    const beforeState = useChatStore.getState();

    act(() => {
      emitBackendEvent({
        type: 'streaming-response',
        conversation_ref: 'conv-stale',
        payload: { text: 'stale chunk' },
      });
    });

    expect(useChatStore.getState()).toEqual(beforeState);
    expect(transcriptSpies.updateTranscriptSession).not.toHaveBeenCalled();
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

    expect(useChatStore.getState().tokenCounts).toEqual(
      expect.objectContaining({
        prompt_tokens: 1,
        visible_output_tokens: 1,
      }),
    );
    expect(transcriptSpies.updateTranscriptSession).toHaveBeenCalledWith(undefined, undefined);
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
