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

  jest.doMock('../../frontend/src/renderer/infrastructure/transcript/ElectronSidecarConversationStore', () => ({
    ElectronSidecarConversationStore: class {
      userId: string;

      constructor(options: { userId: string }) {
        this.userId = options.userId;
      }

      appendTranscriptProjectionEntry(entry: unknown) {
        return mockAppendTranscriptProjectionEntry({
          userId: this.userId,
          entry,
        });
      }
    },
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

  test('stores assistant projection entries through the conversation store adapter', async () => {
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
});
