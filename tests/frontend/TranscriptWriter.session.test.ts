import {
  createStoreTranscriptPayload,
  expectStoreTranscriptCall,
  flushMicrotasks,
  loadTranscriptWriter,
  registerTranscriptWriterSuiteLifecycle,
  TRANSCRIPT_SESSION_STORAGE_KEY,
} from './TranscriptWriter.testUtils';
import {
  createSessionUpdateRecorder,
  withTranscriptSessionUpdateListener,
} from './transcriptSessionEvent.testUtils';

describe('TranscriptWriter session lifecycle', () => {
  registerTranscriptWriterSuiteLifecycle();

  test('loads session info from sessionStorage', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-stored', userId: 'stored-user' }),
    );

    const { writer } = loadTranscriptWriter();
    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-stored',
      userId: 'stored-user',
    });
  });

  test('emits transcript-session-update event and persists session info on update', async () => {
    const { writer, sendMock } = loadTranscriptWriter();
    const { updates, handler } = createSessionUpdateRecorder();

    await withTranscriptSessionUpdateListener(handler, () => {
      writer.updateTranscriptSession('conv-2', 'user-2');
    });

    expect(updates).toEqual([{ conversationRef: 'conv-2', userId: 'user-2' }]);
    expect(window.sessionStorage.getItem(TRANSCRIPT_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify({ conversationRef: 'conv-2', userId: 'user-2' }),
    );
    expect(sendMock).toHaveBeenCalledWith('transcript-session-sync', {
      conversationRef: 'conv-2',
      userId: 'user-2',
    });
  });

  test('skips redundant persistence and session-update events when session info is unchanged', async () => {
    const { writer } = loadTranscriptWriter();
    const { updates, handler } = createSessionUpdateRecorder();
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

    try {
      await withTranscriptSessionUpdateListener(handler, () => {
        writer.updateTranscriptSession('conv-stable', 'user-stable');
        writer.updateTranscriptSession('conv-stable', 'user-stable');
        writer.setActiveConversationRef('conv-stable');
      });

      expect(updates).toEqual([{ conversationRef: 'conv-stable', userId: 'user-stable' }]);
      expect(setItemSpy).toHaveBeenCalledTimes(1);
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test('preserves stored conversation ref when update only provides user id', () => {
    window.sessionStorage.setItem(
      TRANSCRIPT_SESSION_STORAGE_KEY,
      JSON.stringify({ conversationRef: 'conv-stored', userId: null }),
    );
    const { writer } = loadTranscriptWriter();

    writer.updateTranscriptSession(undefined, 'new-user');

    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-stored',
      userId: 'new-user',
    });
  });

  test('setActiveConversationRef updates only conversation identity', () => {
    const { writer, sendMock } = loadTranscriptWriter();
    writer.updateTranscriptSession(null, 'user-1');

    writer.setActiveConversationRef('conv-active');

    expect(writer.getActiveConversationRef()).toBe('conv-active');
    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-active',
      userId: 'user-1',
    });
    expect(sendMock).toHaveBeenLastCalledWith('transcript-session-sync', {
      conversationRef: 'conv-active',
      userId: 'user-1',
    });
  });

  test('applies transcript-session-sync updates from main process without rebroadcast', () => {
    const { writer, sendMock, onHandlers } = loadTranscriptWriter();
    const handler = onHandlers.get('transcript-session-sync');
    expect(typeof handler).toBe('function');

    handler?.({ conversationRef: 'conv-synced', userId: 'user-synced' });

    expect(writer.getTranscriptSessionInfo()).toEqual({
      conversationRef: 'conv-synced',
      userId: 'user-synced',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  test('setActiveConversationRef(null) clears active conversation and queues new messages', async () => {
    const { writer, invokeMock } = loadTranscriptWriter();
    writer.updateTranscriptSession('conv-initial', 'user-1');
    writer.setActiveConversationRef(null);

    expect(writer.getActiveConversationRef()).toBeNull();

    writer.recordUserMessage('message after clear');
    await flushMicrotasks();
    expect(invokeMock).not.toHaveBeenCalled();

    writer.setActiveConversationRef('conv-new');
    await flushMicrotasks();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expectStoreTranscriptCall(invokeMock, createStoreTranscriptPayload({
      content: 'message after clear',
      userId: 'user-1',
      conversationRef: 'conv-new',
      role: 'user',
      messageType: 'user',
    }));
  });
});
