import type {
  BackendEvent,
  BackendEventType,
  LlmThoughtEvent,
  LocalUserMessageEvent,
  WebSearchProgressEvent,
} from '../../../../types/backendEvents';

type ChatStreamEventHandlers = {
  handleLlmThought: (event: LlmThoughtEvent) => void;
  handleWebSearchProgress: (event: WebSearchProgressEvent) => void;
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
};

export function buildChatStreamHandlerMap(
  handlers: ChatStreamEventHandlers,
): Partial<Record<BackendEventType, (event: BackendEvent) => void>> {
  return {
    'llm-thought': event => handlers.handleLlmThought(event as LlmThoughtEvent),
    'web-search-progress': event => handlers.handleWebSearchProgress(event as WebSearchProgressEvent),
    'local-user-message': event => handlers.handleLocalUserMessage(event as LocalUserMessageEvent),
  };
}
