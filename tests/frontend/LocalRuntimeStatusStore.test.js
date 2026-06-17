/**
 * Covers local runtime status store behavior in the frontend test suite.
 */

describe('localRuntimeStatusStore', () => {
  function loadStoreWithDeferredBootstrap() {
    jest.resetModules();
    const listeners = new Map();
    let resolveBootstrap = null;
    const invoke = jest.fn(() => new Promise((resolve) => {
      resolveBootstrap = resolve;
    }));
    const removeListener = jest.fn();

    jest.doMock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
      IpcBridge: {
        invoke,
        on: (channel, listener) => {
          listeners.set(channel, listener);
          return removeListener;
        },
      },
      INVOKE_CHANNELS: {
        GET_LOCAL_BACKEND_STATUS: 'get-local-backend-status',
      },
      ON_CHANNELS: {
        LOCAL_BACKEND_STATUS: 'local-backend-status',
      },
    }));

    const store = require('../../frontend/src/renderer/infrastructure/runtime/localRuntimeStatusStore');
    return {
      ...store,
      invoke,
      listeners,
      removeListener,
      resolveBootstrap: (payload) => {
        if (!resolveBootstrap) {
          throw new Error('bootstrap invoke was not created');
        }
        resolveBootstrap(payload);
      },
    };
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
  }

  test('applies bootstrap status when no live status event wins the race', async () => {
    const store = loadStoreWithDeferredBootstrap();
    const onChange = jest.fn();

    const unsubscribe = store.subscribeLocalRuntimeStatusStore(onChange);
    store.resolveBootstrap({ ready: true, status: 'ready', error: '' });
    await flushPromises();

    expect(store.getLocalRuntimeStatusSnapshot()).toEqual({
      ready: true,
      status: 'ready',
      error: '',
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test('does not let a stale bootstrap read overwrite a newer live status event', async () => {
    const store = loadStoreWithDeferredBootstrap();
    const onChange = jest.fn();

    const unsubscribe = store.subscribeLocalRuntimeStatusStore(onChange);
    store.listeners.get('local-backend-status')({ ready: true, status: 'ready', error: '' });
    store.resolveBootstrap({ ready: false, status: 'stopped', error: '' });
    await flushPromises();

    expect(store.getLocalRuntimeStatusSnapshot()).toEqual({
      ready: true,
      status: 'ready',
      error: '',
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
