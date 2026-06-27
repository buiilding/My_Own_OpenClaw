/**
 * Covers browser session store. behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
const mockSubscribeLocalRuntimeStatusStore = jest.fn(() => jest.fn());
const mockGetLocalRuntimeStatusSnapshot = jest.fn(() => ({
  ready: true,
  status: 'ready',
  error: '',
}));

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    RUN_BROWSER_ACTION: 'run-browser-action',
    DESKTOP_RUNTIME_INVOKE: 'windie:invoke',
  },
}));

jest.mock('../../src/renderer/infrastructure/runtime/localRuntimeStatusStore', () => ({
  getLocalRuntimeStatusSnapshot: () => mockGetLocalRuntimeStatusSnapshot(),
  subscribeLocalRuntimeStatusStore: (...args) => mockSubscribeLocalRuntimeStatusStore(...args),
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
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

describe('browserSessionStore', () => {
  beforeEach(() => {
    jest.resetModules();
    mockInvoke.mockReset();
    mockSubscribeLocalRuntimeStatusStore.mockReset();
    mockSubscribeLocalRuntimeStatusStore.mockReturnValue(jest.fn());
    mockGetLocalRuntimeStatusSnapshot.mockReset();
    mockGetLocalRuntimeStatusSnapshot.mockReturnValue({
      ready: true,
      status: 'ready',
      error: '',
    });
  });

  test('disconnect invalidates an in-flight sync before stale tabs can reconnect the snapshot', async () => {
    const statusResult = createDeferred();
    const getTabsResult = createDeferred();

    mockInvoke.mockImplementation(async (_channel, payload) => {
      if (_channel === 'windie:invoke') {
        return { ok: true, data: { stored: true } };
      }
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
    } = require('../../src/renderer/infrastructure/runtime/browserSessionStore');

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

  test('suppresses browser connect actions until the local runtime is ready', async () => {
    mockGetLocalRuntimeStatusSnapshot.mockReturnValue({
      ready: false,
      status: 'starting',
      error: '',
    });
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'windie:invoke') {
        return { ok: true, data: { stored: true } };
      }
      throw new Error('Browser actions should not run before local runtime readiness.');
    });

    const {
      connectBrowserSession,
      subscribeBrowserSessionStore,
    } = require('../../src/renderer/infrastructure/runtime/browserSessionStore');

    const unsubscribe = subscribeBrowserSessionStore(jest.fn());
    await flushPromises();

    await connectBrowserSession();

    expect(mockInvoke).not.toHaveBeenCalledWith(
      'run-browser-action',
      expect.anything(),
    );
    expect(mockInvoke).toHaveBeenCalledWith('windie:invoke', expect.objectContaining({
      command: 'diagnostics.append',
      payload: expect.objectContaining({
        stage: 'connect_suppressed',
      }),
    }));

    unsubscribe();
  });

  test('syncs the browser session when the local runtime becomes ready', async () => {
    let localRuntimeListener = null;
    mockSubscribeLocalRuntimeStatusStore.mockImplementation((listener) => {
      localRuntimeListener = listener;
      return jest.fn();
    });
    mockGetLocalRuntimeStatusSnapshot.mockReturnValue({
      ready: false,
      status: 'starting',
      error: '',
    });
    mockInvoke.mockImplementation(async (channel, payload = {}) => {
      if (channel === 'windie:invoke') {
        return { ok: true, data: { stored: true } };
      }
      if (payload.action === 'status') {
        return {
          success: true,
          data: {
            connected: true,
            title: 'Docs',
            url: 'https://docs.example.com',
            tab_count: 1,
          },
        };
      }
      if (payload.action === 'get_tabs') {
        return {
          success: true,
          data: {
            tabs: [
              {
                tab_index: 0,
                title: 'Docs',
                url: 'https://docs.example.com',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected browser action: ${payload.action}`);
    });

    const {
      getBrowserSessionSnapshot,
      subscribeBrowserSessionStore,
    } = require('../../src/renderer/infrastructure/runtime/browserSessionStore');

    const unsubscribe = subscribeBrowserSessionStore(jest.fn());
    await flushPromises();
    expect(getBrowserSessionSnapshot()).toEqual(expect.objectContaining({
      localRuntimeReady: false,
      connected: false,
    }));
    expect(mockInvoke).not.toHaveBeenCalledWith(
      'run-browser-action',
      expect.objectContaining({ action: 'status' }),
    );

    mockGetLocalRuntimeStatusSnapshot.mockReturnValue({
      ready: true,
      status: 'ready',
      error: '',
    });
    localRuntimeListener();
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledWith('run-browser-action', expect.objectContaining({
      action: 'status',
    }));
    expect(getBrowserSessionSnapshot()).toEqual(expect.objectContaining({
      localRuntimeReady: true,
      connected: true,
      currentTabLabel: 'Docs',
    }));

    unsubscribe();
  });
});
