/**
 * Covers chat stream thinking status. utils behavior in the frontend test suite.
 */

import { renderHook } from '@testing-library/react';
import { IpcBridge } from '../../src/renderer/infrastructure/ipc/bridge';
import { DESKTOP_RUNTIME_ON_CHANNELS } from '../../src/renderer/infrastructure/ipc/channels';
import { useChatStream } from '../../src/renderer/features/chat/hooks/useChatStream';
import { useConversationRuntimeProjectionStream } from '../../src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream';
import { DesktopConversationContinuityService } from '../../src/renderer/app/runtime/desktopConversationContinuityService';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';
import {
  useChatStore,
} from '../../src/renderer/features/chat/stores/chatStore';
import {
  setMessagesInChatStore,
} from '../../src/renderer/features/chat/stores/chatStoreAdapters';
import { normalizeBackendEventToConversationEvent } from '../../packages/windie-sdk-js/src/transport/backendEventNormalizer';
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
let mockBackendSequence = 1;
const mockUseAppConfigContext = jest.fn(() => ({ config: mockConfig }));

jest.mock('../../src/renderer/app/providers/AppConfigContext', () => ({
  useAppConfigContext: () => mockUseAppConfigContext(),
}));

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    replaceCompactedReplay: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getActiveConversationRef: jest.fn(() => mockActiveConversationRef),
    updateTranscriptSession: jest.fn(),
  },
}));

export const transcriptSpies = {
  replaceCompactedReplay: DesktopConversationContinuityService.replaceCompactedReplay as jest.Mock,
  updateTranscriptSession: DesktopTranscriptSessionRuntimeClient.updateTranscriptSession as jest.Mock,
};

export function resetChatStreamTestState() {
  jest.clearAllMocks();
  mockConfig = createDefaultTestAppConfig();
  mockActiveConversationRef = DEFAULT_TEST_CONVERSATION_REF;
  mockBackendSequence = 1;
  setMockAppConfigContextValue(mockUseAppConfigContext, mockConfig);

  const initialMessage = createAssistantSeedMessage();
  resetChatStoreForTests(initialMessage);
  useChatStore.setState({
    activeConversationRef: DEFAULT_TEST_CONVERSATION_REF,
  });
  setMessagesInChatStore([initialMessage], DEFAULT_TEST_CONVERSATION_REF);
}

export function getActiveWorkspaceStateForTest() {
  return useChatStore.getState().getWorkspaceState();
}

export function setActiveWorkspaceStateForTest(update: Record<string, unknown>) {
  const store = useChatStore.getState();
  const workspaceRef = store.activeConversationRef || '__default__';
  const workspace = store.getWorkspaceState();
  useChatStore.setState({
    workspaces: {
      ...store.workspaces,
      [workspaceRef]: {
        ...workspace,
        ...update,
      },
    },
  });
}

function withBackendEventIdentity(event: Record<string, unknown>): Record<string, unknown> {
  const sequence = typeof event.sequence === 'number' ? event.sequence : mockBackendSequence;
  mockBackendSequence = Math.max(mockBackendSequence + 1, sequence + 1);
  return {
    event_id: event.event_id ?? `test-event-${sequence}`,
    sequence,
    ...event,
  };
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
    const conversationEventHandler = handlers[DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT];
    expect(conversationEventHandler).toEqual(expect.any(Function));
    if (options.injectConversationRef !== false && event && typeof event === 'object' && !Array.isArray(event)) {
      const eventRecord = event as Record<string, unknown>;
      const conversationEvent = normalizeBackendEventToConversationEvent({
        conversation_ref: eventRecord.conversation_ref ?? mockActiveConversationRef,
        ...withBackendEventIdentity(eventRecord),
      } as any);
      if (conversationEvent) {
        conversationEventHandler(conversationEvent);
      }
      return;
    }
    const eventRecord = event && typeof event === 'object' && !Array.isArray(event)
      ? withBackendEventIdentity(event as Record<string, unknown>)
      : event;
    const conversationEvent = normalizeBackendEventToConversationEvent(eventRecord as any);
    if (conversationEvent) {
      conversationEventHandler(conversationEvent);
    }
  };
}

function createEmitRawBackendEvent(handlers: Record<string, (data: unknown) => void>) {
  return (event: unknown, options: { injectConversationRef?: boolean } = {}) => {
    const conversationEventHandler = handlers[DESKTOP_RUNTIME_ON_CHANNELS.CONVERSATION_EVENT];
    if (!conversationEventHandler) {
      return;
    }
    if (options.injectConversationRef !== false && event && typeof event === 'object' && !Array.isArray(event)) {
      const eventRecord = event as Record<string, unknown>;
      const conversationEvent = normalizeBackendEventToConversationEvent({
        conversation_ref: eventRecord.conversation_ref ?? mockActiveConversationRef,
        ...withBackendEventIdentity(eventRecord),
      } as any);
      if (conversationEvent) {
        conversationEventHandler(conversationEvent);
      }
      return;
    }
    const eventRecord = event && typeof event === 'object' && !Array.isArray(event)
      ? withBackendEventIdentity(event as Record<string, unknown>)
      : event;
    const conversationEvent = normalizeBackendEventToConversationEvent(eventRecord as any);
    if (conversationEvent) {
      conversationEventHandler(conversationEvent);
    }
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
    emitRawBackendEvent: (event: unknown) => createEmitRawBackendEvent(handlers)(
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
    emitRawBackendEvent: (event: unknown) => createEmitRawBackendEvent(handlers)(
      event,
      { injectConversationRef: false },
    ),
    emitConversationRuntimeUpdated: (payload: unknown) => {
      const projectionHandler = handlers[DESKTOP_RUNTIME_ON_CHANNELS.CURRENT_TURN];
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
    emitRawBackendEvent: (event: unknown) => createEmitRawBackendEvent(handlers)(
      event,
      { injectConversationRef: false },
    ),
  };
}
