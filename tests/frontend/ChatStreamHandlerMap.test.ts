import type { BackendEvent, BackendEventType } from '../../frontend/src/renderer/types/backendEvents';
import { buildChatStreamHandlerMap } from '../../frontend/src/renderer/features/chat/utils/chatStream/chatStreamHandlerMap';

const EVENT_TYPES: BackendEventType[] = [
  'llm-thought',
  'web-search-progress',
  'local-user-message',
  'memory-store',
  'token-count',
  'error',
];

type HandlerName =
  | 'handleLlmThought'
  | 'handleWebSearchProgress'
  | 'handleLocalUserMessage'
  | 'handleMemoryStore'
  | 'handleTokenCount'
  | 'handleError';

function buildHandlers(): Record<HandlerName, jest.Mock<void, [unknown]>> {
  return {
    handleLlmThought: jest.fn(),
    handleWebSearchProgress: jest.fn(),
    handleLocalUserMessage: jest.fn(),
    handleMemoryStore: jest.fn(),
    handleTokenCount: jest.fn(),
    handleError: jest.fn(),
  };
}

describe('chatStreamHandlerMap', () => {
  test('registers handlers only for backend events still owned by the raw handler map', () => {
    const handlers = buildHandlers();
    const map = buildChatStreamHandlerMap(handlers);
    expect(Object.keys(map).sort()).toEqual([...EVENT_TYPES].sort());
    expect(map['streaming-response']).toBeUndefined();
    expect(map['streaming-complete']).toBeUndefined();
    expect(map['tool-call']).toBeUndefined();
    expect(map['tool-output']).toBeUndefined();
    expect(map['tool-bundle']).toBeUndefined();
    expect(map['context-compaction-started']).toBeUndefined();
    expect(map['context-compaction-completed']).toBeUndefined();
    expect(map['context-compaction-failed']).toBeUndefined();
    expect(map['system-prompt']).toBeUndefined();
    expect(map['user-message-full']).toBeUndefined();
    expect(map['assistant-message-full']).toBeUndefined();
    expect(map['tool-schemas']).toBeUndefined();
  });

  test('routes non-error events to matching handlers', () => {
    const handlers = buildHandlers();
    const map = buildChatStreamHandlerMap(handlers);
    const dispatchCases: Array<{
      type: Exclude<BackendEventType, 'error'>;
      handlerName: Exclude<HandlerName, 'handleError'>;
    }> = [
      { type: 'llm-thought', handlerName: 'handleLlmThought' },
      { type: 'web-search-progress', handlerName: 'handleWebSearchProgress' },
      { type: 'local-user-message', handlerName: 'handleLocalUserMessage' },
      { type: 'memory-store', handlerName: 'handleMemoryStore' },
      { type: 'token-count', handlerName: 'handleTokenCount' },
    ];

    dispatchCases.forEach(({ type, handlerName }) => {
      const event = { type, payload: {} } as BackendEvent;
      map[type]?.(event);
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
