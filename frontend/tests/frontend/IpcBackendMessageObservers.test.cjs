/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createBackendMessageObserverRegistry,
} = require('../../src/main/ipc/ipc_backend_message_observers.cjs');

describe('ipc_backend_message_observers', () => {
  test('registers, notifies, unsubscribes, and resets backend message observers', () => {
    const log = jest.fn();
    const registry = createBackendMessageObserverRegistry({ log });
    const first = jest.fn();
    const second = jest.fn(() => {
      throw new Error('observer failed');
    });
    const unsubscribeFirst = registry.register(first);
    registry.register(second);

    registry.notify({ type: 'query-progress' });
    registry.notify(null);
    registry.notify(['not-an-event']);

    expect(first).toHaveBeenCalledWith({ type: 'query-progress' });
    expect(second).toHaveBeenCalledWith({ type: 'query-progress' });
    expect(log).toHaveBeenCalledWith('Backend message observer error: Error: observer failed');

    unsubscribeFirst();
    registry.notify({ type: 'query-complete' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    registry.reset();
    registry.notify({ type: 'ignored-after-reset' });
    expect(second).toHaveBeenCalledTimes(2);
  });

  test('returns a no-op unsubscribe for invalid observers', () => {
    const registry = createBackendMessageObserverRegistry();
    const unsubscribe = registry.register(null);

    expect(() => unsubscribe()).not.toThrow();
  });

  test('ipc.cjs delegates backend message observer storage to the registry helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_message_observers.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createBackendMessageObserverRegistry({');
    expect(mainSource).not.toContain('const backendMessageObservers = new Set()');
    expect(mainSource).not.toContain('for (const observer of backendMessageObservers)');
    expect(helperSource).toContain('const observers = new Set();');
    expect(helperSource).toContain('for (const observer of observers)');
  });
});
