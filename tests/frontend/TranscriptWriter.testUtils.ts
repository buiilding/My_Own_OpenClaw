type TranscriptWriterModule = typeof import('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter');

export const TRANSCRIPT_SESSION_STORAGE_KEY = 'transcript-session-info';
type TranscriptRole = 'user' | 'assistant' | 'tool';
type TranscriptMessageType = 'user' | 'llm-text' | 'tool-call' | 'tool-output';

type StoreTranscriptPayload = {
  content: string;
  userId?: string;
  conversationRef?: string;
  role: TranscriptRole;
  messageType: TranscriptMessageType;
  toolName?: string;
  correlationId?: string;
  modelId?: string;
  modelProvider?: string;
  screenshot?: string;
  timestamp?: string;
};

export function loadTranscriptWriter() {
  jest.resetModules();
  const invokeMock = jest.fn().mockResolvedValue(undefined);

  jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
    IpcBridge: { invoke: invokeMock },
    INVOKE_CHANNELS: { STORE_TRANSCRIPT: 'store-transcript' },
  }));

  const writer = require('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter') as TranscriptWriterModule;
  return { writer, invokeMock };
}

export async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

export function registerTranscriptWriterSuiteLifecycle() {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
  });
}

export function createStoreTranscriptPayload(
  overrides: Partial<StoreTranscriptPayload> & Pick<StoreTranscriptPayload, 'content' | 'role' | 'messageType'>,
): StoreTranscriptPayload {
  return {
    content: overrides.content,
    userId: undefined,
    conversationRef: undefined,
    role: overrides.role,
    messageType: overrides.messageType,
    toolName: undefined,
    correlationId: undefined,
    modelId: undefined,
    modelProvider: undefined,
    screenshot: undefined,
    timestamp: undefined,
    ...overrides,
  };
}

export function expectStoreTranscriptCall(
  invokeMock: jest.Mock,
  payload: ReturnType<typeof createStoreTranscriptPayload>,
) {
  expect(invokeMock).toHaveBeenCalledWith('store-transcript', payload);
}

export function expectNthStoreTranscriptCall(
  invokeMock: jest.Mock,
  callIndex: number,
  payload: ReturnType<typeof createStoreTranscriptPayload>,
) {
  expect(invokeMock).toHaveBeenNthCalledWith(callIndex, 'store-transcript', payload);
}
