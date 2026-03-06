import { flushPendingEntries, requeuePending } from '../../frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush';

describe('transcriptPendingFlush', () => {
  test('requeuePending enqueues each message in order', () => {
    const enqueue = jest.fn();
    requeuePending(['a', 'b', 'c'], enqueue);
    expect(enqueue).toHaveBeenNthCalledWith(1, 'a');
    expect(enqueue).toHaveBeenNthCalledWith(2, 'b');
    expect(enqueue).toHaveBeenNthCalledWith(3, 'c');
  });

  test('flushPendingEntries stores all messages when no failures', async () => {
    const storeTranscriptEntry = jest.fn(async () => undefined);
    const requeue = jest.fn();
    const warn = jest.fn();

    const ok = await flushPendingEntries({
      messages: [{ text: 'one' }, { text: 'two' }],
      toTranscriptEntry: (message) => ({ content: message.text, role: 'user', messageType: 'user' }),
      requeue,
      category: 'user',
      storeTranscriptEntry,
      warn,
    });

    expect(ok).toBe(true);
    expect(storeTranscriptEntry).toHaveBeenCalledTimes(2);
    expect(requeue).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test('flushPendingEntries requeues tail when a write fails', async () => {
    const storeTranscriptEntry = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const requeue = jest.fn();
    const warn = jest.fn();

    const ok = await flushPendingEntries({
      messages: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
      toTranscriptEntry: (message) => ({ content: message.text, role: 'assistant', messageType: 'llm-text' }),
      requeue,
      category: 'assistant',
      storeTranscriptEntry,
      warn,
    });

    expect(ok).toBe(false);
    expect(requeue).toHaveBeenCalledWith([{ text: 'two' }, { text: 'three' }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
