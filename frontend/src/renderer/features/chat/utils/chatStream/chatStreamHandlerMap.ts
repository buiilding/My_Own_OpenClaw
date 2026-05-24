import type {
  BackendEvent,
  BackendEventType,
  LocalUserMessageEvent,
} from '../../../../types/backendEvents';

type ChatStreamEventHandlers = {
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
};

export function buildChatStreamHandlerMap(
  handlers: ChatStreamEventHandlers,
): Partial<Record<BackendEventType, (event: BackendEvent) => void>> {
  return {
    'local-user-message': event => handlers.handleLocalUserMessage(event as LocalUserMessageEvent),
  };
}
