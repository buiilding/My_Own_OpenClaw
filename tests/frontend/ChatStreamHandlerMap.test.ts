import type { BackendEvent, BackendEventType } from '../../frontend/src/renderer/types/backendEvents';
import { buildChatStreamHandlerMap } from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamHandlerMap';

const EVENT_TYPES: BackendEventType[] = [
  'llm-thought',
  'streaming-response',
  'streaming-complete',
  'context-compaction-started',
  'context-compaction-completed',
  'context-compaction-failed',
  'tool-call',
  'tool-output',
  'tool-bundle',
  'web-search-progress',
  'system-prompt',
  'local-user-message',
  'user-message-full',
  'assistant-message-full',
  'memory-store',
  'token-count',
  'tool-schemas',
  'error',
];

type HandlerName =
  | 'handleLlmThought'
  | 'handleStreamingResponse'
  | 'handleStreamingComplete'
  | 'handleContextCompactionStarted'
  | 'handleContextCompactionCompleted'
  | 'handleContextCompactionFailed'
  | 'handleToolCall'
  | 'handleToolOutput'
  | 'handleToolBundle'
  | 'handleWebSearchProgress'
  | 'handleSystemPrompt'
  | 'handleLocalUserMessage'
  | 'handleUserMessageFull'
  | 'handleAssistantMessageFull'
  | 'handleMemoryStore'
  | 'handleTokenCount'
  | 'handleToolSchemas'
  | 'handleError';

function buildHandlers(): Record<HandlerName, jest.Mock<void, [unknown]>> {
  return {
    handleLlmThought: jest.fn(),
    handleStreamingResponse: jest.fn(),
    handleStreamingComplete: jest.fn(),
    handleContextCompactionStarted: jest.fn(),
    handleContextCompactionCompleted: jest.fn(),
    handleContextCompactionFailed: jest.fn(),
    handleToolCall: jest.fn(),
    handleToolOutput: jest.fn(),
    handleToolBundle: jest.fn(),
    handleWebSearchProgress: jest.fn(),
    handleSystemPrompt: jest.fn(),
    handleLocalUserMessage: jest.fn(),
    handleUserMessageFull: jest.fn(),
    handleAssistantMessageFull: jest.fn(),
    handleMemoryStore: jest.fn(),
    handleTokenCount: jest.fn(),
    handleToolSchemas: jest.fn(),
    handleError: jest.fn(),
  };
}

describe('chatStreamHandlerMap', () => {
  test('registers one handler for every backend event type', () => {
    const handlers = buildHandlers();
    const map = buildChatStreamHandlerMap(handlers);
    expect(Object.keys(map).sort()).toEqual([...EVENT_TYPES].sort());
  });

  test('routes non-error events to matching handlers', () => {
    const handlers = buildHandlers();
    const map = buildChatStreamHandlerMap(handlers);
    const dispatchCases: Array<{
      type: Exclude<BackendEventType, 'error'>;
      handlerName: Exclude<HandlerName, 'handleError'>;
    }> = [
      { type: 'llm-thought', handlerName: 'handleLlmThought' },
      { type: 'streaming-response', handlerName: 'handleStreamingResponse' },
      { type: 'streaming-complete', handlerName: 'handleStreamingComplete' },
      { type: 'context-compaction-started', handlerName: 'handleContextCompactionStarted' },
      { type: 'context-compaction-completed', handlerName: 'handleContextCompactionCompleted' },
      { type: 'context-compaction-failed', handlerName: 'handleContextCompactionFailed' },
      { type: 'tool-call', handlerName: 'handleToolCall' },
      { type: 'tool-output', handlerName: 'handleToolOutput' },
      { type: 'tool-bundle', handlerName: 'handleToolBundle' },
      { type: 'web-search-progress', handlerName: 'handleWebSearchProgress' },
      { type: 'system-prompt', handlerName: 'handleSystemPrompt' },
      { type: 'local-user-message', handlerName: 'handleLocalUserMessage' },
      { type: 'user-message-full', handlerName: 'handleUserMessageFull' },
      { type: 'assistant-message-full', handlerName: 'handleAssistantMessageFull' },
      { type: 'memory-store', handlerName: 'handleMemoryStore' },
      { type: 'token-count', handlerName: 'handleTokenCount' },
      { type: 'tool-schemas', handlerName: 'handleToolSchemas' },
    ];

    dispatchCases.forEach(({ type, handlerName }) => {
      const event = { type, payload: {} } as BackendEvent;
      map[type](event);
      expect(handlers[handlerName]).toHaveBeenCalledTimes(1);
      expect(handlers[handlerName]).toHaveBeenCalledWith(event);
    });
  });

  test('filters recoverable settings-update errors but routes other errors', () => {
    const handlers = buildHandlers();
    const map = buildChatStreamHandlerMap(handlers);

    map.error({
      type: 'error',
      payload: { message: 'Failed to update settings: transient issue' },
    } as BackendEvent);
    expect(handlers.handleError).not.toHaveBeenCalled();

    const terminalError = {
      type: 'error',
      payload: { message: 'Unexpected backend error' },
    } as BackendEvent;
    map.error(terminalError);
    expect(handlers.handleError).toHaveBeenCalledTimes(1);
    expect(handlers.handleError).toHaveBeenCalledWith(terminalError);
  });
});
