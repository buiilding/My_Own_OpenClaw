import { createPendingUserQueue } from '../../frontend/src/renderer/infrastructure/transcript/pendingUserQueue';

describe('pendingUserQueue', () => {
  test('enqueues pending user messages and drains in insertion order', () => {
    const queue = createPendingUserQueue();
    queue.enqueue({ text: 'first', timestamp: 't1' });
    queue.enqueue({ text: 'second', timestamp: 't2' });

    expect(queue.size()).toBe(2);
    expect(queue.drain()).toEqual([
      { text: 'first', timestamp: 't1' },
      { text: 'second', timestamp: 't2' },
    ]);
    expect(queue.size()).toBe(0);
  });

  test('drain returns empty array when queue is empty', () => {
    const queue = createPendingUserQueue();
    expect(queue.drain()).toEqual([]);
  });
});
