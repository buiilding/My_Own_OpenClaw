import { renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { DesktopConversationRuntimeClient } from '../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  createAssistantSeedMessage,
  resetChatStoreForTests,
} from './chatStoreTestUtils';
import {
  createDefaultTestAppConfig,
  setMockAppConfigContextValue,
  type TestAppConfig,
  type TestAvailableModels,
} from './appConfigTestUtils';

let mockConfig: TestAppConfig = createDefaultTestAppConfig();
const DEFAULT_TEST_CONVERSATION_REF = 'conv-test';
let mockActiveConversationRef: string | null = DEFAULT_TEST_CONVERSATION_REF;
const mockUseAppConfigContext = jest.fn(() => ({ config: mockConfig }));
const mockBackendEventTypes = new Set([
  'query-accepted',
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
  'local-user-message',
  'system-prompt',
  'user-message-full',
  'assistant-message-full',
  'memory-store',
  'token-count',
  'tool-schemas',
  'error',
]);

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockUseAppConfigContext(),
}));

jest.mock('../../frontend/src/renderer/features/chat/session/desktopConversationRuntimeClient', () => ({
  DesktopConversationRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockActiveConversationRef),
    toBackendStreamEvent: jest.fn((data: unknown) => {
      const eventType = data && typeof data === 'object' && !Array.isArray(data)
        ? (data as { type?: unknown }).type
        : null;
      return typeof eventType === 'string' && mockBackendEventTypes.has(eventType)
        ? data
        : null;
    }),
    normalizeBackendStreamEvent: jest.fn((event: {
      conversation_ref?: string;
      payload?: Record<string, unknown>;
      turn_ref?: string;
      type?: string;
    }, options?: { conversationRef?: string | null }) => {
      const conversationRef = event.conversation_ref || options?.conversationRef || mockActiveConversationRef;
      if (event.type === 'llm-thought') {
        return {
          type: 'reasoning_delta',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            text: typeof event.payload?.status === 'string'
              ? event.payload.status
              : (typeof event.payload?.content === 'string' ? event.payload.content : ''),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'streaming-response') {
        return {
          type: 'assistant_delta',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            text: typeof event.payload?.text === 'string' ? event.payload.text : '',
            rawEvent: event,
          },
        };
      }
      if (event.type === 'streaming-complete') {
        return {
          type: 'turn_completed',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            finalResponse: typeof event.payload?.final_response === 'string'
              ? event.payload.final_response
              : null,
            rawEvent: event,
          },
        };
      }
      if (event.type === 'system-prompt') {
        return {
          type: 'system_prompt',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'user-message-full') {
        return {
          type: 'user_message_metadata',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'assistant-message-full') {
        return {
          type: 'assistant_message',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'tool-schemas') {
        return {
          type: 'tool_schemas_metadata',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'error') {
        return {
          type: 'turn_error',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            message: typeof event.payload?.message === 'string'
              ? event.payload.message
              : (typeof event.payload?.content === 'string' ? event.payload.content : 'Backend error'),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'token-count') {
        return {
          type: 'usage_updated',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'memory-store') {
        return {
          type: 'memory_stored',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'tool-call') {
        return {
          type: 'tool_call',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            structuredPayload: event.payload || {},
            rawEvent: event,
          },
        };
      }
      if (event.type === 'web-search-progress') {
        return {
          type: 'tool_progress',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            toolName: 'web_search',
            text: typeof event.payload?.text === 'string' ? event.payload.text : '',
            requestId: typeof event.payload?.request_id === 'string' ? event.payload.request_id : null,
            correlationId: typeof event.payload?.request_id === 'string' ? event.payload.request_id : null,
            structuredPayload: event.payload || {},
            rawEvent: event,
          },
        };
      }
      if (event.type === 'tool-output') {
        return {
          type: 'tool_output',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            structuredPayload: event.payload || {},
            rawEvent: event,
          },
        };
      }
      if (event.type === 'tool-bundle') {
        return {
          type: 'tool_bundle_call',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            bundleId: typeof event.payload?.bundle_id === 'string' ? event.payload.bundle_id : null,
            tools: Array.isArray(event.payload?.tools) ? event.payload.tools : [],
            structuredPayload: event.payload || {},
            rawEvent: event,
          },
        };
      }
      if (event.type === 'context-compaction-started') {
        return {
          type: 'compaction_started',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'context-compaction-completed') {
        const replacementHistoryEntries = Array.isArray(event.payload?.replacement_history_entries)
          ? event.payload.replacement_history_entries
          : [];
        const skippedReason = typeof event.payload?.skipped_reason === 'string'
          ? event.payload.skipped_reason
          : '';
        return {
          type: skippedReason || replacementHistoryEntries.length === 0
            ? 'compaction_skipped'
            : 'compaction_applied',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            skippedReason: skippedReason || (replacementHistoryEntries.length > 0 ? null : 'missing-replacement-history'),
            rawEvent: event,
          },
        };
      }
      if (event.type === 'context-compaction-failed') {
        return {
          type: 'compaction_failed',
          conversationRef,
          turnRef: event.turn_ref,
          source: 'backend',
          payload: {
            ...(event.payload || {}),
            rawEvent: event,
          },
        };
      }
      return {
        type: event.type ?? 'unknown',
        conversationRef,
        turnRef: event.turn_ref,
        source: 'backend',
        payload: { rawEvent: event },
      };
    }),
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
    updateTranscriptSession: jest.fn(),
  },
}));

export const transcriptSpies = {
  recordAssistantMessage: DesktopConversationRuntimeClient.recordAssistantMessage as jest.Mock,
  recordToolMessage: DesktopConversationRuntimeClient.recordToolMessage as jest.Mock,
  updateTranscriptSession: DesktopConversationRuntimeClient.updateTranscriptSession as jest.Mock,
};

export function resetChatStreamTestState() {
  jest.clearAllMocks();
  mockConfig = createDefaultTestAppConfig();
  mockActiveConversationRef = DEFAULT_TEST_CONVERSATION_REF;
  setMockAppConfigContextValue(mockUseAppConfigContext, mockConfig);

  resetChatStoreForTests(createAssistantSeedMessage());
  useChatStore.setState({
    activeConversationRef: DEFAULT_TEST_CONVERSATION_REF,
  });
}

export function setMockConfig(
  config: TestAppConfig,
  availableModels?: TestAvailableModels,
) {
  mockConfig = config;
  setMockAppConfigContextValue(mockUseAppConfigContext, mockConfig, availableModels);
}

export function setMockActiveConversationRef(conversationRef: string | null) {
  mockActiveConversationRef = conversationRef;
}

function createEmitBackendEvent(handlers: Record<string, (data: unknown) => void>) {
  return (event: unknown, options: { injectConversationRef?: boolean } = {}) => {
    const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
    expect(backendHandler).toEqual(expect.any(Function));
    if (options.injectConversationRef !== false && event && typeof event === 'object' && !Array.isArray(event)) {
      const eventRecord = event as Record<string, unknown>;
      backendHandler({
        conversation_ref: eventRecord.conversation_ref ?? mockActiveConversationRef,
        ...eventRecord,
      });
      return;
    }
    backendHandler(event);
  };
}

export function registerBackendListener(enableTranscript = true) {
  const handlers: Record<string, (data: unknown) => void> = {};
  jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
    handlers[channel] = handler;
    return () => {};
  });

  renderHook(() => useChatStream(enableTranscript));

  return {
    handlers,
    emitBackendEvent: createEmitBackendEvent(handlers),
    emitRawBackendEvent: (event: unknown) => createEmitBackendEvent(handlers)(
      event,
      { injectConversationRef: false },
    ),
  };
}

export function renderBackendListenerWithSpy(enableTranscript = true) {
  const handlers: Record<string, (data: unknown) => void> = {};
  const removeListener = jest.fn();
  const onSpy = jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
    handlers[channel] = handler;
    return removeListener;
  });

  const hook = renderHook(
    ({ shouldEnableTranscript }) => useChatStream(shouldEnableTranscript),
    { initialProps: { shouldEnableTranscript: enableTranscript } },
  );

  return {
    ...hook,
    handlers,
    onSpy,
    removeListener,
    emitBackendEvent: createEmitBackendEvent(handlers),
    emitRawBackendEvent: (event: unknown) => createEmitBackendEvent(handlers)(
      event,
      { injectConversationRef: false },
    ),
  };
}
