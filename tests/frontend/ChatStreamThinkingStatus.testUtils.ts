import { renderHook } from '@testing-library/react';
import { IpcBridge, ON_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { useChatStream } from '../../frontend/src/renderer/features/chat/hooks/useChatStream';
import { useChatStore } from '../../frontend/src/renderer/features/chat/stores/chatStore';
import {
  recordAssistantMessage,
  recordToolMessage,
  updateTranscriptSession,
} from '../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter';

let mockConfig = {
  selected_model_id: 'test-model',
  model_provider: 'test-provider',
};
let mockActiveConversationRef: string | null = null;
const mockUseAppConfigContext = jest.fn(() => ({ config: mockConfig }));

jest.mock('../../frontend/src/renderer/app/providers/AppContextHooks', () => ({
  useAppConfigContext: () => mockUseAppConfigContext(),
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getActiveConversationRef: jest.fn(() => mockActiveConversationRef),
  recordAssistantMessage: jest.fn(),
  recordToolMessage: jest.fn(),
  updateTranscriptSession: jest.fn(),
}));

export const transcriptSpies = {
  recordAssistantMessage: recordAssistantMessage as jest.Mock,
  recordToolMessage: recordToolMessage as jest.Mock,
  updateTranscriptSession: updateTranscriptSession as jest.Mock,
};

export function resetChatStreamTestState() {
  jest.clearAllMocks();
  mockConfig = {
    selected_model_id: 'test-model',
    model_provider: 'test-provider',
  };
  mockActiveConversationRef = null;
  mockUseAppConfigContext.mockReturnValue({ config: mockConfig });

  useChatStore.setState({
    messages: [
      {
        id: 'init',
        text: 'Hello!',
        sender: 'assistant',
      },
    ],
    isSending: false,
    thinkingStatus: null,
    tokenCounts: null,
    streamTracking: {
      activeTurnRef: null,
      phase: 'idle',
      startedAt: null,
      firstChunkAt: null,
      completedAt: null,
      lastEventAt: null,
      lastEventType: null,
      eventCount: 0,
      chunkCount: 0,
      toolCallCount: 0,
      toolOutputCount: 0,
      lastChunkSize: 0,
      lastError: null,
    },
  });
}

export function setMockConfig(config: { selected_model_id: string; model_provider: string }) {
  mockConfig = config;
  mockUseAppConfigContext.mockReturnValue({ config: mockConfig });
}

export function setMockActiveConversationRef(conversationRef: string | null) {
  mockActiveConversationRef = conversationRef;
}

function createEmitBackendEvent(handlers: Record<string, (data: unknown) => void>) {
  return (event: unknown) => {
    const backendHandler = handlers[ON_CHANNELS.FROM_BACKEND];
    expect(backendHandler).toEqual(expect.any(Function));
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
  };
}
