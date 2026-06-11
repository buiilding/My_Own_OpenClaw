const mockInvoke = jest.fn();
const mockSubscribeLocalBackendStatusStore = jest.fn(() => jest.fn());
const mockGetLocalBackendStatusSnapshot = jest.fn(() => ({
  ready: true,
  status: 'ready',
  error: '',
}));

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    RUN_BROWSER_ACTION: 'run-browser-action',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/runtime/localBackendStatusStore', () => ({
  getLocalBackendStatusSnapshot: () => mockGetLocalBackendStatusSnapshot(),
  subscribeLocalBackendStatusStore: (...args) => mockSubscribeLocalBackendStatusStore(...args),
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('browserSessionStore', () => {
  beforeEach(() => {
    jest.resetModules();
    mockInvoke.mockReset();
    mockSubscribeLocalBackendStatusStore.mockReset();
    mockSubscribeLocalBackendStatusStore.mockReturnValue(jest.fn());
    mockGetLocalBackendStatusSnapshot.mockReset();
    mockGetLocalBackendStatusSnapshot.mockReturnValue({
      ready: true,
      status: 'ready',
      error: '',
    });
  });

  test('disconnect invalidates an in-flight sync before stale tabs can reconnect the snapshot', async () => {
    const statusResult = createDeferred();
    const getTabsResult = createDeferred();

    mockInvoke.mockImplementation(async (_channel, payload) => {
      if (payload.action === 'status') {
        return statusResult.promise;
      }
      if (payload.action === 'get_tabs') {
        return getTabsResult.promise;
      }
      if (payload.action === 'close') {
        return { success: true, data: {} };
      }
      throw new Error(`Unexpected browser action: ${payload.action}`);
    });

    const {
      disconnectBrowserSession,
      getBrowserSessionSnapshot,
      subscribeBrowserSessionStore,
    } = require('../../frontend/src/renderer/infrastructure/runtime/browserSessionStore');

    const unsubscribe = subscribeBrowserSessionStore(jest.fn());
    await flushPromises();

    statusResult.resolve({
      success: true,
      data: {
        connected: true,
        title: 'Before disconnect',
        url: 'https://example.com/',
      },
    });
    await flushPromises();

    const disconnectPromise = disconnectBrowserSession();
    await flushPromises();
    await disconnectPromise;

    expect(getBrowserSessionSnapshot()).toEqual(expect.objectContaining({
      connected: false,
      busyAction: '',
    }));

    getTabsResult.resolve({
      success: true,
      data: {
        tabs: [
          {
            tab_index: 1,
            title: 'Stale connected tab',
            url: 'https://example.com/',
          },
        ],
      },
    });
    await flushPromises();

    expect(getBrowserSessionSnapshot()).toEqual(expect.objectContaining({
      connected: false,
      currentTargetId: '',
      tabs: [],
    }));

    unsubscribe();
  });
});
