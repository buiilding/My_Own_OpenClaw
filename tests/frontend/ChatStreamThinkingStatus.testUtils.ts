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
    normalizeBackendStreamEvent: jest.fn((event: { type?: string }) => ({
      type: event.type ?? 'unknown',
      source: 'backend',
    })),
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
