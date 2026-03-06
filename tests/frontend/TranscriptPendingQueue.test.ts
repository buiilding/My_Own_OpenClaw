import { createPendingUserQueue } from '../../frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue';

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

  test('drained array mutation does not re-populate queue', () => {
    const queue = createPendingUserQueue();
    queue.enqueue({ text: 'first', timestamp: 't1' });

    const drained = queue.drain();
    drained.push({ text: 'mutated', timestamp: 't2' } as any);

    expect(queue.size()).toBe(0);
    expect(queue.drain()).toEqual([]);
  });
});
