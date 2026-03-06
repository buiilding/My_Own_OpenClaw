/** @jest-environment node */

const {
  persistMemoryStoreEvent,
} = require('../../frontend/src/main/ipc/ipc_memory_store_persistence.cjs');

describe('ipc_memory_store_persistence', () => {
  test('maps payload-first memory store fields with session fallbacks', async () => {
    const storeMemory = jest.fn().mockResolvedValue({ success: true });
    persistMemoryStoreEvent({
      user_id: 'event-user',
      session_id: 'event-session',
      conversation_ref: 'event-conv',
      payload: {
        user_query: 'u',
        assistant_response: 'a',
        memory_type: 'semantic',
        user_id: 'payload-user',
      },
    }, { storeMemory, log: jest.fn() });

    await Promise.resolve();
    expect(storeMemory).toHaveBeenCalledWith({
      user_query: 'u',
      assistant_response: 'a',
      memory_type: 'semantic',
      user_id: 'payload-user',
      session_id: 'event-session',
    });
  });

  test('defaults memory_type and uses conversation_ref when session ids are absent', async () => {
    const storeMemory = jest.fn().mockResolvedValue({ success: true });
    persistMemoryStoreEvent({
      user_id: 'event-user',
      conversation_ref: 'conv-1',
      payload: {
        user_query: 'u',
        assistant_response: 'a',
      },
    }, { storeMemory, log: jest.fn() });

    await Promise.resolve();
    expect(storeMemory).toHaveBeenCalledWith({
      user_query: 'u',
      assistant_response: 'a',
      memory_type: 'episodic',
      user_id: 'event-user',
      session_id: 'conv-1',
    });
  });

  test('dispatches mapped payload to storeMemory', async () => {
    const storeMemory = jest.fn().mockResolvedValue({ success: true });

    persistMemoryStoreEvent(
      {
        user_id: 'event-user',
        payload: {
          user_query: 'u',
          assistant_response: 'a',
        },
      },
      { storeMemory, log: jest.fn() },
    );

    await Promise.resolve();
    expect(storeMemory).toHaveBeenCalledWith({
      user_query: 'u',
      assistant_response: 'a',
      memory_type: 'episodic',
      user_id: 'event-user',
      session_id: undefined,
    });
  });

  test('logs persistence failures', async () => {
    const log = jest.fn();
    const storeMemory = jest.fn().mockRejectedValue(new Error('boom'));

    persistMemoryStoreEvent(
      {
        payload: { user_query: 'u', assistant_response: 'a' },
      },
      { storeMemory, log },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith('Main-process memory-store persistence failed: boom');
  });

  test('no-ops when storeMemory is unavailable', () => {
    expect(() => persistMemoryStoreEvent({}, { log: jest.fn() })).not.toThrow();
  });
});
