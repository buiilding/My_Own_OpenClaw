import type {
  AssistantMessageFullEvent,
  BackendEvent,
  BackendEventType,
  ErrorEvent,
  LlmThoughtEvent,
  LocalUserMessageEvent,
  MemoryStoreEvent,
  SystemPromptEvent,
  TokenCountEvent,
  ToolSchemasEvent,
  UserMessageFullEvent,
  WebSearchProgressEvent,
} from '../../../../types/backendEvents';
import { shouldIgnoreStreamError } from './chatStreamEventUtils';

type ChatStreamEventHandlers = {
  handleLlmThought: (event: LlmThoughtEvent) => void;
  handleWebSearchProgress: (event: WebSearchProgressEvent) => void;
  handleSystemPrompt: (event: SystemPromptEvent) => void;
  handleLocalUserMessage: (event: LocalUserMessageEvent) => void;
  handleUserMessageFull: (event: UserMessageFullEvent) => void;
  handleAssistantMessageFull: (event: AssistantMessageFullEvent) => void;
  handleMemoryStore: (event: MemoryStoreEvent) => void;
  handleTokenCount: (event: TokenCountEvent) => void;
  handleToolSchemas: (event: ToolSchemasEvent) => void;
  handleError: (event: ErrorEvent) => void;
};

export function buildChatStreamHandlerMap(
  handlers: ChatStreamEventHandlers,
): Partial<Record<BackendEventType, (event: BackendEvent) => void>> {
  return {
    'llm-thought': event => handlers.handleLlmThought(event as LlmThoughtEvent),
    'web-search-progress': event => handlers.handleWebSearchProgress(event as WebSearchProgressEvent),
    'system-prompt': event => handlers.handleSystemPrompt(event as SystemPromptEvent),
    'local-user-message': event => handlers.handleLocalUserMessage(event as LocalUserMessageEvent),
    'user-message-full': event => handlers.handleUserMessageFull(event as UserMessageFullEvent),
    'assistant-message-full': event => handlers.handleAssistantMessageFull(event as AssistantMessageFullEvent),
    'memory-store': event => handlers.handleMemoryStore(event as MemoryStoreEvent),
    'token-count': event => handlers.handleTokenCount(event as TokenCountEvent),
    'tool-schemas': event => handlers.handleToolSchemas(event as ToolSchemasEvent),
    'error': event => {
      const errorEvent = event as ErrorEvent;
      if (!shouldIgnoreStreamError(errorEvent.payload)) {
        handlers.handleError(errorEvent);
      }
    },
  };
}
