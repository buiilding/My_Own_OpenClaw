/** @jest-environment node */

const {
  createLocalBackendRpcTransport,
} = require('../../frontend/src/main/sidecar/local_backend_bridge_rpc_transport.cjs');

describe('local_backend_bridge_rpc_transport', () => {
  test('routes requests through daemon rpc transport when daemon is available', async () => {
    const daemonManager = {
      rpc: jest.fn(async ({ id, method, params }) => ({
        jsonrpc: '2.0',
        id,
        result: { method, params },
      })),
    };
    const standaloneTransport = {
      sendRequest: jest.fn(),
    };
    const transport = createLocalBackendRpcTransport({
      getDaemonManager: () => daemonManager,
      getDaemonLaunchOptions: () => ({ isPackaged: true }),
      standaloneTransport,
      createRequestId: () => 'rpc-1',
    });

    await expect(transport.sendRequest('search_memory', { query: 'hello' })).resolves.toEqual({
      method: 'search_memory',
      params: { query: 'hello' },
    });

    expect(daemonManager.rpc).toHaveBeenCalledWith({
      id: 'rpc-1',
      method: 'search_memory',
      params: { query: 'hello' },
    }, {
      isPackaged: true,
    });
    expect(standaloneTransport.sendRequest).not.toHaveBeenCalled();
  });

  test('uses standalone process transport with the same request interface when daemon is unavailable', async () => {
    const standaloneTransport = {
      sendRequest: jest.fn(async () => ({ status: 'ok' })),
    };
    const transport = createLocalBackendRpcTransport({
      getDaemonManager: () => null,
      standaloneTransport,
    });

    await expect(transport.sendRequest('ping', {}, { timeoutMs: 10 })).resolves.toEqual({
      status: 'ok',
    });

    expect(standaloneTransport.sendRequest).toHaveBeenCalledWith('ping', {}, { timeoutMs: 10 });
  });

  test('normalizes daemon json-rpc errors through sendRequestOrError', async () => {
    const transport = createLocalBackendRpcTransport({
      getDaemonManager: () => ({
        rpc: jest.fn(async () => ({
          jsonrpc: '2.0',
          id: 'rpc-1',
          error: { message: 'boom' },
        })),
      }),
      standaloneTransport: {
        sendRequest: jest.fn(),
      },
      createRequestId: () => 'rpc-1',
    });

    await expect(transport.sendRequestOrError('ping')).resolves.toEqual({
      success: false,
      error: 'boom',
    });
  });
});
