import type {
  BackendEvent,
  BackendEventType,
  LlmThoughtEvent,
  LocalUserMessageEvent,
  MemoryStoreEvent,
  TokenCountEvent,
  WebSearchProgressEvent,
} from '../../../../types/backendEvents';

type ChatStreamEventHandlers = {
  handleLlmThought: (event: LlmThoughtEvent) => void;
  handleWebSearchProgress: (event: WebSearchProgressEvent) => void;
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
  handleMemoryStore: (event: MemoryStoreEvent) => void;
  handleTokenCount: (event: TokenCountEvent) => void;
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
  };
}
