const mockAppendTranscriptProjectionEntry = jest.fn();
const mockSend = jest.fn();
const mockOn = jest.fn();

function loadDesktopTranscriptRuntimes() {
  jest.resetModules();
  mockAppendTranscriptProjectionEntry.mockReset();
  mockSend.mockReset();
  mockOn.mockReset();

  jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
    IpcBridge: {
      send: mockSend,
      on: mockOn,
    },
    SEND_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
    ON_CHANNELS: { TRANSCRIPT_SESSION_SYNC: 'transcript-session-sync' },
  }));

  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/desktopConversationStore', () => ({
    appendTranscriptProjectionEntry: (userId: string, entry: unknown) => mockAppendTranscriptProjectionEntry({
      userId,
      entry,
    }),
  }));

  const { DesktopTranscriptProjectionRuntimeClient } = require(
    '../../frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient',
  );
  const { DesktopTranscriptSessionRuntimeClient } = require(
    '../../frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient',
  );
  return {
    projectionClient: DesktopTranscriptProjectionRuntimeClient,
    sessionClient: DesktopTranscriptSessionRuntimeClient,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('DesktopTranscriptProjectionRuntimeClient', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test('queues projection entries until the desktop session runtime has identity', async () => {
    const { projectionClient, sessionClient } = loadDesktopTranscriptRuntimes();
    mockAppendTranscriptProjectionEntry.mockResolvedValue(undefined);

    projectionClient.recordUserMessage('queued user row');
    await flushMicrotasks();

    expect(mockAppendTranscriptProjectionEntry).not.toHaveBeenCalled();

    sessionClient.updateTranscriptSession('conv-runtime', 'user-runtime');
    await flushMicrotasks();

    expect(mockAppendTranscriptProjectionEntry).toHaveBeenCalledWith({
      userId: 'user-runtime',
      entry: expect.objectContaining({
        conversationRef: 'conv-runtime',
        content: 'queued user row',
        role: 'user',
        messageType: 'user',
      }),
    });
  });

  test('stores assistant projection entries through the desktop SDK store projection helper', async () => {
    const { projectionClient, sessionClient } = loadDesktopTranscriptRuntimes();
    mockAppendTranscriptProjectionEntry.mockResolvedValue(undefined);
    sessionClient.updateTranscriptSession('conv-assistant', 'user-assistant');

    projectionClient.recordAssistantMessage('assistant row', {
      transparency: {
        systemPrompt: 'bad \uD800 prompt',
      },
    });
    await flushMicrotasks();

    expect(mockAppendTranscriptProjectionEntry).toHaveBeenCalledWith({
      userId: 'user-assistant',
      entry: expect.objectContaining({
        conversationRef: 'conv-assistant',
        content: 'assistant row',
        role: 'assistant',
        messageType: 'llm-text',
        transparency: expect.objectContaining({
          systemPrompt: 'bad \uFFFD prompt',
        }),
      }),
    });
  });

  test('stores screenshot refs as refs instead of inline screenshot data', async () => {
    const { projectionClient, sessionClient } = loadDesktopTranscriptRuntimes();
    mockAppendTranscriptProjectionEntry.mockResolvedValue(undefined);
    sessionClient.updateTranscriptSession('conv-shot', 'user-shot');

    projectionClient.recordToolMessage('screenshot result', {
      messageType: 'tool-output',
      toolName: 'screenshot',
      correlationId: 'call-shot',
      screenshotRef: 'artifact-shot-1',
    });
    await flushMicrotasks();

    expect(mockAppendTranscriptProjectionEntry).toHaveBeenCalledTimes(1);
    const stored = mockAppendTranscriptProjectionEntry.mock.calls[0][0];
    expect(stored.userId).toBe('user-shot');
    expect(stored.entry).toEqual(expect.objectContaining({
      conversationRef: 'conv-shot',
      screenshotRef: 'artifact-shot-1',
      rehydrateEntry: expect.objectContaining({
        screenshot_ref: 'artifact-shot-1',
        screenshot: null,
      }),
    }));
    expect(stored.entry).not.toHaveProperty('screenshot');
  });

  test('retry preserves assistant and tool transcript metadata after immediate write failure', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { projectionClient, sessionClient } = loadDesktopTranscriptRuntimes();
    mockAppendTranscriptProjectionEntry
      .mockRejectedValueOnce(new Error('assistant write failed'))
      .mockRejectedValueOnce(new Error('tool write failed'))
      .mockResolvedValue(undefined);
    sessionClient.updateTranscriptSession('conv-initial', 'user-retry');

    projectionClient.recordAssistantMessage('assistant row', {
      timestamp: '2026-05-25T12:00:00.000Z',
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: { provider: 'openai' },
      },
    });
    projectionClient.recordToolMessage('tool row', {
      messageType: 'tool-output',
      toolName: 'browser',
      correlationId: 'call-1',
      timestamp: '2026-05-25T12:00:01.000Z',
      structuredPayload: {
        kind: 'tool-output',
        toolCallDetails: { status: 'ok' },
      },
    });
    await flushMicrotasks();

    sessionClient.updateTranscriptSession('conv-retry', 'user-retry');
    await flushMicrotasks();

    expect(mockAppendTranscriptProjectionEntry).toHaveBeenCalledTimes(4);
    expect(mockAppendTranscriptProjectionEntry.mock.calls[2][0]).toEqual({
      userId: 'user-retry',
      entry: expect.objectContaining({
        conversationRef: 'conv-retry',
        content: 'assistant row',
        role: 'assistant',
        messageType: 'llm-text',
        timestamp: '2026-05-25T12:00:00.000Z',
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: { provider: 'openai' },
        },
      }),
    });
    expect(mockAppendTranscriptProjectionEntry.mock.calls[3][0]).toEqual({
      userId: 'user-retry',
      entry: expect.objectContaining({
        conversationRef: 'conv-retry',
        content: 'tool row',
        role: 'tool',
        messageType: 'tool-output',
        toolName: 'browser',
        correlationId: 'call-1',
        timestamp: '2026-05-25T12:00:01.000Z',
        structuredPayload: {
          kind: 'tool-output',
          toolCallDetails: { status: 'ok' },
        },
      }),
    });
    warnSpy.mockRestore();
  });
});
