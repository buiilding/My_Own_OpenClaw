import type {
  BackendEvent,
  BackendEventType,
  ErrorEvent,
  LlmThoughtEvent,
  LocalUserMessageEvent,
  MemoryStoreEvent,
  TokenCountEvent,
  WebSearchProgressEvent,
} from '../../../../types/backendEvents';
import { shouldIgnoreStreamError } from './chatStreamEventUtils';

type ChatStreamEventHandlers = {
  handleLlmThought: (event: LlmThoughtEvent) => void;
  handleWebSearchProgress: (event: WebSearchProgressEvent) => void;
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
  handleMemoryStore: (event: MemoryStoreEvent) => void;
  handleTokenCount: (event: TokenCountEvent) => void;
  handleError: (event: ErrorEvent) => void;
};

export function buildChatStreamHandlerMap(
  handlers: ChatStreamEventHandlers,
): Partial<Record<BackendEventType, (event: BackendEvent) => void>> {
  return {
    'llm-thought': event => handlers.handleLlmThought(event as LlmThoughtEvent),
    'web-search-progress': event => handlers.handleWebSearchProgress(event as WebSearchProgressEvent),
    'local-user-message': event => handlers.handleLocalUserMessage(event as LocalUserMessageEvent),
    'memory-store': event => handlers.handleMemoryStore(event as MemoryStoreEvent),
    'token-count': event => handlers.handleTokenCount(event as TokenCountEvent),
    'error': event => {
      const errorEvent = event as ErrorEvent;
      if (!shouldIgnoreStreamError(errorEvent.payload)) {
        handlers.handleError(errorEvent);
      }
    },
  };
}
