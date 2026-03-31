import type {
  AssistantMessageFullEvent,
  BackendEvent,
  BackendEventType,
  ContextCompactionCompletedEvent,
  ContextCompactionFailedEvent,
  ContextCompactionStartedEvent,
  ErrorEvent,
  LlmThoughtEvent,
  LocalUserMessageEvent,
  MemoryStoreEvent,
  SearchSourceEvent,
  StreamingCompleteEvent,
  StreamingResponseEvent,
  SystemPromptEvent,
  TokenCountEvent,
  ToolBundleEvent,
  ToolCallEvent,
  ToolOutputEvent,
  ToolSchemasEvent,
  UserMessageFullEvent,
} from '../../../../types/backendEvents';
import { shouldIgnoreStreamError } from './chatStreamEventUtils';

type ChatStreamEventHandlers = {
  handleLlmThought: (event: LlmThoughtEvent) => void;
  handleStreamingResponse: (event: StreamingResponseEvent) => void;
  handleStreamingComplete: (event: StreamingCompleteEvent) => void;
  handleContextCompactionStarted: (event: ContextCompactionStartedEvent) => void;
  handleContextCompactionCompleted: (event: ContextCompactionCompletedEvent) => void;
  handleContextCompactionFailed: (event: ContextCompactionFailedEvent) => void;
  handleToolCall: (event: ToolCallEvent) => void;
  handleToolOutput: (event: ToolOutputEvent) => void;
  handleToolBundle: (event: ToolBundleEvent) => void;
  handleSearchSource: (event: SearchSourceEvent) => void;
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
): Record<BackendEventType, (event: BackendEvent) => void> {
  return {
    'llm-thought': event => handlers.handleLlmThought(event as LlmThoughtEvent),
    'streaming-response': event => handlers.handleStreamingResponse(event as StreamingResponseEvent),
    'streaming-complete': event => handlers.handleStreamingComplete(event as StreamingCompleteEvent),
    'context-compaction-started': event => handlers.handleContextCompactionStarted(event as ContextCompactionStartedEvent),
    'context-compaction-completed': event => handlers.handleContextCompactionCompleted(event as ContextCompactionCompletedEvent),
    'context-compaction-failed': event => handlers.handleContextCompactionFailed(event as ContextCompactionFailedEvent),
    'tool-call': event => handlers.handleToolCall(event as ToolCallEvent),
    'tool-output': event => handlers.handleToolOutput(event as ToolOutputEvent),
    'search-source': event => handlers.handleSearchSource(event as SearchSourceEvent),
    'tool-bundle': event => handlers.handleToolBundle(event as ToolBundleEvent),
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
