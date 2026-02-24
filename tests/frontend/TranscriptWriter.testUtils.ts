type TranscriptWriterModule = typeof import('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter');

export const TRANSCRIPT_SESSION_STORAGE_KEY = 'transcript-session-info';

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
