import { renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { useConversationRuntimeProjectionStream } from '../../frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream';
import { DesktopConversationContinuityService } from '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import { DesktopTranscriptProjectionRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient';
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

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockUseAppConfigContext(),
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    replaceCompactedReplay: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockActiveConversationRef),
    updateTranscriptSession: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient', () => ({
  DesktopTranscriptProjectionRuntimeClient: {
    recordAssistantMessage: jest.fn(),
    recordToolMessage: jest.fn(),
  },
}));

export const transcriptSpies = {
  recordAssistantMessage: DesktopTranscriptProjectionRuntimeClient.recordAssistantMessage as jest.Mock,
  recordToolMessage: DesktopTranscriptProjectionRuntimeClient.recordToolMessage as jest.Mock,
  replaceCompactedReplay: DesktopConversationContinuityService.replaceCompactedReplay as jest.Mock,
  updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock,
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

export function registerBackendAndProjectionListeners(enableTranscript = true) {
  const handlers: Record<string, (data: unknown) => void> = {};
  jest.spyOn(IpcBridge, 'on').mockImplementation((channel, handler) => {
    handlers[channel] = handler;
    return () => {};
  });

  renderHook(() => {
    useConversationRuntimeProjectionStream();
    useChatStream(enableTranscript);
  });

  return {
    handlers,
    emitBackendEvent: createEmitBackendEvent(handlers),
    emitRawBackendEvent: (event: unknown) => createEmitBackendEvent(handlers)(
      event,
      { injectConversationRef: false },
    ),
    emitConversationRuntimeUpdated: (payload: unknown) => {
      const projectionHandler = handlers[ON_CHANNELS.CONVERSATION_RUNTIME_UPDATED];
      expect(projectionHandler).toEqual(expect.any(Function));
      projectionHandler(payload);
    },
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
