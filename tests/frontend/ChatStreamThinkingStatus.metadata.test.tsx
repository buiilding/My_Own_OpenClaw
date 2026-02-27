import { act } from '@testing-library/react';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { registerBackendListener, resetChatStreamTestState } from './ChatStreamThinkingStatus.testUtils';

describe('useChatStream message metadata handling', () => {
  beforeEach(() => {
    resetChatStreamTestState();
  });

  test('system-prompt event updates last user message metadata', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply' },
        ],
      });
      emitBackendEvent({
        type: 'system-prompt',
        payload: {
          content: 'prompt text',
          tool_schemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
        },
      });
    });

    const userMessage = useChatStore.getState().messages[0];
    expect(userMessage.systemPrompt).toEqual({
      content: 'prompt text',
      toolSchemas: [{ type: 'function', function: { name: 'tool-a', parameters: { type: 'object' } } }],
    });
  });

  test('full-message events enrich existing user and assistant messages', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask', turnRef: 'turn-1' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-1' },
        ],
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw user', metadata: { a: 1 } },
      });
      emitBackendEvent({
        type: 'assistant-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw assistant' },
      });
    });

    const [userMessage, assistantMessage] = useChatStore.getState().messages;
    expect(userMessage.fullUserMessage).toEqual({
      content: 'raw user',
      metadata: { a: 1 },
    });
    expect(assistantMessage.fullAssistantMessage).toEqual({
      content: 'raw assistant',
    });
  });

  test('user-message-full falls back to latest user message when turn_ref has no match', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask without turn ref' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-1' },
        ],
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'raw user fallback', metadata: { a: 1 } },
      });
    });

    const userMessage = useChatStore.getState().messages[0];
    expect(userMessage.fullUserMessage).toEqual({
      content: 'raw user fallback',
      metadata: { a: 1 },
    });
  });

  test('tool-schemas event updates first user message', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'first user' },
          { id: 'assistant-1', sender: 'assistant', text: 'assistant' },
          { id: 'user-2', sender: 'user', text: 'second user' },
        ],
      });
      emitBackendEvent({
        type: 'tool-schemas',
        payload: {
          tool_schemas: [{ type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } }],
        },
      });
    });

    expect(useChatStore.getState().messages[0].toolSchemas).toEqual([
      { type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } },
    ]);
    expect(useChatStore.getState().messages[2].toolSchemas).toBeUndefined();
  });

  test('assistant-message-full does not attach to tool-output messages', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'check', turnRef: 'turn-1' },
          {
            id: 'tool-output-1',
            sender: 'assistant',
            text: 'tool output',
            type: 'tool-output',
            turnRef: 'turn-1',
          },
        ],
      });

      emitBackendEvent({
        type: 'assistant-message-full',
        turn_ref: 'turn-1',
        payload: { content: 'final text' },
      });
    });

    const toolOutput = useChatStore.getState().messages.find((message) => message.id === 'tool-output-1');
    expect(toolOutput?.fullAssistantMessage).toBeUndefined();
  });

  test('tool-call message stores raw arguments preview metadata for recoverable parse failures', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      emitBackendEvent({
        type: 'tool-call',
        payload: {
          tool_name: 'run_shell_command',
          parameters: {},
          metadata: {
            llm_tool_call_validation_failed: true,
            skip_frontend_execution: true,
            llm_tool_call_raw_arguments_preview: '{"command":"cat > index.html << \\"EOF\\""}...[truncated]',
            llm_tool_call_parse_error: 'failed to parse streamed tool-call arguments',
          },
        },
      });
    });

    const toolCallMessage = useChatStore.getState().messages.at(-1);
    expect(toolCallMessage).toEqual(expect.objectContaining({
      type: 'tool-call',
      modelFacingToolCall: expect.objectContaining({
        name: 'run_shell_command',
        raw_arguments_preview: expect.stringContaining('cat > index.html'),
        parse_error: 'failed to parse streamed tool-call arguments',
        frontend_execution_skipped: true,
      }),
    }));
    expect((toolCallMessage?.modelFacingToolCall as Record<string, unknown>)?.arguments).toBeUndefined();
  });
});
