import type {
  BackendEvent,
  BackendEventType,
  LocalUserMessageEvent,
  WebSearchProgressEvent,
} from '../../../../types/backendEvents';

type ChatStreamEventHandlers = {
  handleWebSearchProgress: (event: WebSearchProgressEvent) => void;
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
};

export function buildChatStreamHandlerMap(
  handlers: ChatStreamEventHandlers,
): Partial<Record<BackendEventType, (event: BackendEvent) => void>> {
  return {
    'web-search-progress': event => handlers.handleWebSearchProgress(event as WebSearchProgressEvent),
    'local-user-message': event => handlers.handleLocalUserMessage(event as LocalUserMessageEvent),
  };
}
