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
  transparency?: Record<string, unknown>;
  structuredPayload?: Record<string, unknown> | null;
  workspacePath?: string | null;
  workspaceName?: string | null;
};

export function loadTranscriptWriter() {
  jest.resetModules();
  const invokeMock = jest.fn().mockResolvedValue(undefined);
  const sendMock = jest.fn();
  const onHandlers = new Map<string, (...args: any[]) => void>();
  const onMock = jest.fn((channel: string, handler: (...args: any[]) => void) => {
    onHandlers.set(channel, handler);
    return jest.fn();
  });

  jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
    IpcBridge: { invoke: invokeMock, send: sendMock, on: onMock },
    INVOKE_CHANNELS: { STORE_TRANSCRIPT: 'store-transcript' },
    SEND_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
    ON_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
  }));
  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/conversationReplayState', () => ({
    ensureConversationReplayStateInitialized: jest.fn().mockResolvedValue('bootstrapped'),
    appendConversationReplayEntry: jest.fn(),
  }));
  jest.doMock('../../frontend/src/renderer/infrastructure/workspace/conversationWorkspaceBinding', () => ({
    getConversationWorkspaceBinding: jest.fn(() => ({
      workspacePath: null,
      workspaceName: null,
    })),
  }));

  const writer = require('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter') as TranscriptWriterModule;
  return { writer, invokeMock, sendMock, onMock, onHandlers };
}

export async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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
  const payload: StoreTranscriptPayload = {
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
    workspacePath: null,
    workspaceName: null,
    ...overrides,
  };
  if (overrides.structuredPayload !== undefined) {
    payload.structuredPayload = overrides.structuredPayload;
  }
  return payload;
}

export function expectStoreTranscriptCall(
  invokeMock: jest.Mock,
  payload: ReturnType<typeof createStoreTranscriptPayload>,
) {
  const call = invokeMock.mock.calls.find((args) => args[0] === 'store-transcript');
  expect(call).toBeDefined();
  expect(call?.[1]).toEqual(payload);
}

export function expectNthStoreTranscriptCall(
  invokeMock: jest.Mock,
  callIndex: number,
  payload: ReturnType<typeof createStoreTranscriptPayload>,
) {
  const call = invokeMock.mock.calls[callIndex - 1];
  expect(call).toBeDefined();
  expect(call?.[0]).toBe('store-transcript');
  expect(call?.[1]).toEqual(payload);
}

export function setupStoreFailureRetry(invokeMock: jest.Mock, errorMessage = 'store failed') {
  invokeMock.mockRejectedValueOnce(new Error(errorMessage)).mockResolvedValue(undefined);
}

export async function withSuppressedConsoleWarn(run: () => Promise<void> | void) {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await run();
  } finally {
    warnSpy.mockRestore();
  }
}
