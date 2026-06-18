/**
 * Covers chat stream thinking status.metadata. behavior in the frontend test suite.
 */

import { act } from '@testing-library/react';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import { registerBackendListener, resetChatStreamTestState } from './ChatStreamThinkingStatus.testUtils';
import { buildCurrentTurnMessagesFromProjection } from '../../frontend/src/renderer/features/chat/utils/state/chatBoxResponseState';

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
          tool_schemas: [{ type: 'function', name: 'tool-a', parameters: { type: 'object' } }],
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

  test('turn-scoped user-message-full does not update unrelated user messages', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask for older turn', turnRef: 'turn-a' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-1' },
        ],
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-b',
        payload: { content: 'raw user for missing turn', metadata: { a: 1 } },
      });
    });

    const userMessage = useChatStore.getState().messages[0];
    expect(userMessage.fullUserMessage).toBeUndefined();
  });

  test('turn-scoped tool-schemas metadata does not update unrelated user messages', () => {
    const { emitBackendEvent } = registerBackendListener();
    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'first user', turnRef: 'turn-a' },
          { id: 'assistant-1', sender: 'assistant', text: 'assistant', type: 'llm-text', turnRef: 'turn-a' },
          { id: 'user-2', sender: 'user', text: 'second user', turnRef: 'turn-c' },
        ],
      });
      emitBackendEvent({
        type: 'tool-schemas',
        turn_ref: 'turn-b',
        payload: {
          tool_schemas: [{ type: 'function', name: 'tool-x', parameters: { type: 'object' } }],
        },
      });
    });

    expect(useChatStore.getState().messages[0].toolSchemas).toBeUndefined();
    expect(useChatStore.getState().messages[2].toolSchemas).toBeUndefined();
  });

  test('tool-schemas event updates the current turn user message and later user rows still inherit conversation transparency', () => {
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
          tool_schemas: [{ type: 'function', name: 'tool-x', parameters: { type: 'object' } }],
        },
      });
    });

    expect(useChatStore.getState().messages[0].toolSchemas).toBeUndefined();
    expect(useChatStore.getState().messages[2].toolSchemas).toEqual([
      { type: 'function', function: { name: 'tool-x', parameters: { type: 'object' } } },
    ]);
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

  test('stale turn metadata events do not mutate active turn messages', () => {
    const { emitBackendEvent } = registerBackendListener();

    act(() => {
      useChatStore.setState({
        messages: [
          { id: 'user-1', sender: 'user', text: 'ask', turnRef: 'turn-new' },
          { id: 'assistant-1', sender: 'assistant', text: 'reply', type: 'llm-text', turnRef: 'turn-new' },
        ],
        streamTracking: {
          activeTurnRef: 'turn-new',
          phase: 'streaming',
          startedAt: '2026-03-05T00:00:00.000Z',
          firstChunkAt: '2026-03-05T00:00:01.000Z',
          completedAt: null,
          lastEventAt: '2026-03-05T00:00:01.000Z',
          lastEventType: 'streaming-response',
          eventCount: 2,
          chunkCount: 1,
          toolCallCount: 0,
          toolOutputCount: 0,
          lastChunkSize: 5,
          lastError: null,
        },
      });

      emitBackendEvent({
        type: 'system-prompt',
        turn_ref: 'turn-old',
        payload: {
          content: 'stale prompt',
          tool_schemas: [{ type: 'function', name: 'tool-a', parameters: { type: 'object' } }],
        },
      });
      emitBackendEvent({
        type: 'user-message-full',
        turn_ref: 'turn-old',
        payload: { content: 'stale user', metadata: { stale: true } },
      });
      emitBackendEvent({
        type: 'assistant-message-full',
        turn_ref: 'turn-old',
        payload: { content: 'stale assistant' },
      });
      emitBackendEvent({
        type: 'tool-schemas',
        turn_ref: 'turn-old',
        payload: {
          tool_schemas: [{ type: 'function', name: 'tool-stale', parameters: { type: 'object' } }],
        },
      });
    });

    const [userMessage, assistantMessage] = useChatStore.getState().messages;
    expect(userMessage.systemPrompt).toBeUndefined();
    expect(userMessage.fullUserMessage).toBeUndefined();
    expect(userMessage.toolSchemas).toBeUndefined();
    expect(assistantMessage.fullAssistantMessage).toBeUndefined();
  });

  test('projected tool-call message stores raw arguments preview metadata for recoverable parse failures', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
      conversationRef: 'conv-test',
      turnRef: 'turn-test',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-bad',
        kind: 'tool_call',
        toolName: 'run_shell_command',
        toolArguments: {},
        toolMetadata: {
          llm_tool_call_validation_failed: true,
          skip_frontend_execution: true,
          llm_tool_call_raw_tool_call_preview: '{"id":"tool_bad","name":"run_shell_command","arguments":"{\\"command\\":\\"cat > index.html << \\\\\\"EOF\\\\\\"\\"}...[truncated]"}',
          llm_tool_call_raw_arguments_preview: '{"command":"cat > index.html << \\"EOF\\""}...[truncated]',
          llm_tool_call_parse_error: 'failed to parse streamed tool-call arguments',
        },
        toolCallDetails: {
          toolName: 'run_shell_command',
        },
        payload: {
          tool_name: 'run_shell_command',
        },
      }],
    });

    const toolCallMessage = messages.at(-1);
    expect(toolCallMessage).toEqual(expect.objectContaining({
      type: 'tool-call',
      modelFacingToolCall: expect.objectContaining({
        name: 'run_shell_command',
        raw_tool_call_preview: expect.stringContaining('"name":"run_shell_command"'),
        raw_arguments_preview: expect.stringContaining('cat > index.html'),
        parse_error: 'failed to parse streamed tool-call arguments',
        frontend_execution_skipped: true,
      }),
    }));
    expect((toolCallMessage?.modelFacingToolCall as Record<string, unknown>)?.arguments).toBeUndefined();
    expect(toolCallMessage?.text).toBe(
      '{"id":"tool_bad","name":"run_shell_command","arguments":"{\\"command\\":\\"cat > index.html << \\\\\\"EOF\\\\\\"\\"}...[truncated]"}',
    );
  });

  test('projected tool-call message keeps preserved model-facing payload visible for pre-dispatch validation failures', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
      conversationRef: 'conv-test',
      turnRef: 'turn-test',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-raw-2',
        kind: 'tool_call',
        toolName: 'run_shell_command',
        modelFacingToolCall: {
          id: 'tool_raw_2',
          name: 'run_shell_command',
          arguments: {
            explanation: 'Create a temporary test file to test the replace tool',
            command: "echo 'Original text to replace' > /tmp/test_replace.txt",
          },
        },
        toolArguments: {
          explanation: 'Create a temporary test file to test the replace tool',
          command: "echo 'Original text to replace' > /tmp/test_replace.txt",
        },
        toolMetadata: {
          llm_tool_call_validation_failed: true,
          skip_frontend_execution: true,
        },
        toolCallDetails: {
          toolName: 'run_shell_command',
        },
        payload: {
          tool_name: 'run_shell_command',
        },
      }],
    });

    const toolCallMessage = messages.at(-1);
    expect(toolCallMessage?.text).toBe(
      JSON.stringify({
        id: 'tool_raw_2',
        name: 'run_shell_command',
        arguments: {
          explanation: 'Create a temporary test file to test the replace tool',
          command: "echo 'Original text to replace' > /tmp/test_replace.txt",
        },
        metadata: {
          llm_tool_call_validation_failed: true,
          skip_frontend_execution: true,
        },
        frontend_execution_skipped: true,
      }, null, 2),
    );
    expect(toolCallMessage).toEqual(expect.objectContaining({
      type: 'tool-call',
      modelFacingToolCall: expect.objectContaining({
        id: 'tool_raw_2',
        name: 'run_shell_command',
        arguments: {
          explanation: 'Create a temporary test file to test the replace tool',
          command: "echo 'Original text to replace' > /tmp/test_replace.txt",
        },
        frontend_execution_skipped: true,
      }),
    }));
  });

  test('projected tool-call message marks frontend execution skipped for direct-tool validation failures', () => {
    const messages = buildCurrentTurnMessagesFromProjection({
      conversationRef: 'conv-test',
      turnRef: 'turn-test',
      phase: 'tool_call',
      assistantText: '',
      reasoningText: null,
      lastError: null,
      toolEvents: [{
        id: 'tool-validation',
        kind: 'tool_call',
        toolName: 'mouse_control',
        toolArguments: {
          action: 'click',
          x: 100,
          y: 200,
        },
        toolMetadata: {
          llm_tool_call_validation_failed: true,
          skip_frontend_execution: true,
        },
        toolCallDetails: {
          toolName: 'mouse_control',
        },
        payload: {
          tool_name: 'mouse_control',
        },
      }],
    });

    const toolCallMessage = messages.at(-1);
    expect(toolCallMessage).toEqual(expect.objectContaining({
      type: 'tool-call',
      modelFacingToolCall: expect.objectContaining({
        name: 'mouse_control',
        frontend_execution_skipped: true,
        arguments: { action: 'click', x: 100, y: 200 },
      }),
    }));
  });
});
