import { recordImmediateTranscriptEntry } from '../../frontend/src/renderer/infrastructure/transcript/transcriptRecordWrite';

describe('transcriptRecordWrite', () => {
  test('skips storing when text is empty', () => {
    const resolveSessionInfo = jest.fn(() => ({ conversationRef: 'conv', userId: 'user' }));
    const queueForRetry = jest.fn();
    const buildEntry = jest.fn();
    const storeWithRetry = jest.fn();

    recordImmediateTranscriptEntry({
      text: '',
      resolveSessionInfo,
      queueForRetry,
      buildEntry,
      storeWithRetry,
      warningMessage: 'warn',
    });

    expect(resolveSessionInfo).not.toHaveBeenCalled();
    expect(buildEntry).not.toHaveBeenCalled();
    expect(storeWithRetry).not.toHaveBeenCalled();
  });

  test('skips storing when session cannot be resolved', () => {
    const resolveSessionInfo = jest.fn(() => null);
    const queueForRetry = jest.fn();
    const buildEntry = jest.fn();
    const storeWithRetry = jest.fn();

    recordImmediateTranscriptEntry({
      text: 'hello',
      resolveSessionInfo,
      queueForRetry,
      buildEntry,
      storeWithRetry,
      warningMessage: 'warn',
    });

    expect(resolveSessionInfo).toHaveBeenCalledTimes(1);
    expect(buildEntry).not.toHaveBeenCalled();
    expect(storeWithRetry).not.toHaveBeenCalled();
  });

  test('stores entry with retry callback and warning message when session exists', () => {
    const resolveSessionInfo = jest.fn(() => ({ conversationRef: 'conv-1', userId: 'user-1' }));
    const queueForRetry = jest.fn();
    const entry = { content: 'hello', role: 'user', messageType: 'user' };
    const buildEntry = jest.fn(() => entry);
    const storeWithRetry = jest.fn();

    recordImmediateTranscriptEntry({
      text: 'hello',
      resolveSessionInfo,
      queueForRetry,
      buildEntry,
      storeWithRetry,
      warningMessage: '[TranscriptWriter] warn',
    });

    expect(buildEntry).toHaveBeenCalledWith({ conversationRef: 'conv-1', userId: 'user-1' });
    expect(storeWithRetry).toHaveBeenCalledWith(entry, queueForRetry, '[TranscriptWriter] warn');
  });
});
