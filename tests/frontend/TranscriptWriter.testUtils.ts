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
  const invokeMock = jest.fn().mockResolvedValue({ success: true });
  const sendMock = jest.fn();
  const onHandlers = new Map<string, (...args: any[]) => void>();
  const onMock = jest.fn((channel: string, handler: (...args: any[]) => void) => {
    onHandlers.set(channel, handler);
    return jest.fn();
  });

  jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
    IpcBridge: { invoke: invokeMock, send: sendMock, on: onMock },
    INVOKE_CHANNELS: {
      STORE_TRANSCRIPT: 'store-transcript',
      GET_CONVERSATION: 'get-conversation',
      LIST_CONVERSATIONS: 'list-conversations',
      DELETE_CONVERSATION: 'delete-conversation',
    },
    SEND_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
    ON_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
  }));
  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/localConversationStore', () => ({
    loadStoredConversationEntries: jest.fn().mockResolvedValue([]),
    listStoredConversations: jest.fn().mockResolvedValue([]),
  }));
  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore', () => ({
    SDK_CONVERSATION_EVENT_RECORD_KIND: 'conversation_event',
    ElectronSidecarConversationStore: class {
      userId: string;

      constructor(options: { userId: string }) {
        this.userId = options.userId;
      }

      async appendTranscriptProjectionEntry(entry: any) {
        await invokeMock('store-transcript', {
          content: entry.content,
          userId: this.userId,
          conversationRef: entry.conversationRef,
          role: entry.role,
          messageType: eventMessageType(entry.messageType, entry.role),
          toolName: entry.toolName ?? null,
          correlationId: entry.correlationId ?? null,
          screenshot: entry.screenshot ?? null,
          recordKind: 'conversation_event',
          workspacePath: null,
          workspaceName: null,
          structuredPayload: {
            windieSdkConversationEvent: {
              type: eventMessageType(entry.messageType, entry.role),
              payload: {
                text: entry.content,
                role: entry.role,
                messageType: entry.messageType,
              },
            },
          },
        });
      }
    },
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
  expectCanonicalStorePayload(call?.[1], payload);
}

export function expectNthStoreTranscriptCall(
  invokeMock: jest.Mock,
  callIndex: number,
  payload: ReturnType<typeof createStoreTranscriptPayload>,
) {
  const call = invokeMock.mock.calls[callIndex - 1];
  expect(call).toBeDefined();
  expect(call?.[0]).toBe('store-transcript');
  expectCanonicalStorePayload(call?.[1], payload);
}

export function setupStoreFailureRetry(invokeMock: jest.Mock, errorMessage = 'store failed') {
  invokeMock.mockRejectedValueOnce(new Error(errorMessage)).mockResolvedValue({ success: true });
}

function eventMessageType(messageType: string, role: string): string {
  if (role === 'user' || messageType === 'user') {
    return 'user_message';
  }
  if (messageType === 'tool-call') {
    return 'tool_call';
  }
  if (role === 'tool' || messageType === 'tool-output') {
    return 'tool_output';
  }
  return 'assistant_message';
}

function expectCanonicalStorePayload(
  actual: unknown,
  expected: ReturnType<typeof createStoreTranscriptPayload>,
) {
  const expectedPayload: Record<string, unknown> = {
    content: expected.content,
    userId: expected.userId,
    conversationRef: expected.conversationRef,
    role: expected.role,
    messageType: eventMessageType(expected.messageType, expected.role),
    recordKind: 'conversation_event',
    workspacePath: expected.workspacePath,
    workspaceName: expected.workspaceName,
    structuredPayload: {
      windieSdkConversationEvent: expect.objectContaining({
        type: eventMessageType(expected.messageType, expected.role),
        payload: expect.objectContaining({
          text: expected.content,
          role: expected.role,
          messageType: expected.messageType,
        }),
      }),
    },
  };
  if (expected.toolName !== undefined) {
    expectedPayload.toolName = expected.toolName;
  }
  if (expected.correlationId !== undefined) {
    expectedPayload.correlationId = expected.correlationId;
  }
  if (expected.screenshot !== undefined) {
    expectedPayload.screenshot = expected.screenshot;
  }
  expect(actual).toEqual(expect.objectContaining(expectedPayload));
}

export async function withSuppressedConsoleWarn(run: () => Promise<void> | void) {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await run();
  } finally {
    warnSpy.mockRestore();
  }
}
