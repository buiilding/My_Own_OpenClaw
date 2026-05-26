/** @jest-environment node */

const {
  createLocalBackendRpcTransport,
} = require('../../frontend/src/main/local_backend_bridge_rpc_transport.cjs');

describe('local_backend_bridge_rpc_transport', () => {
  test('routes requests through daemon rpc transport when daemon is available', async () => {
    const daemonManager = {
      rpc: jest.fn(async ({ id, method, params }) => ({
        jsonrpc: '2.0',
        id,
        result: { method, params },
      })),
    };
    const legacyTransport = {
      sendRequest: jest.fn(),
    };
    const transport = createLocalBackendRpcTransport({
      getDaemonManager: () => daemonManager,
      getDaemonLaunchOptions: () => ({ isPackaged: true }),
      legacyTransport,
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
    expect(legacyTransport.sendRequest).not.toHaveBeenCalled();
  });

  test('falls back to legacy process transport with the same request interface', async () => {
    const legacyTransport = {
      sendRequest: jest.fn(async () => ({ status: 'ok' })),
    };
    const transport = createLocalBackendRpcTransport({
      getDaemonManager: () => null,
      legacyTransport,
    });

    await expect(transport.sendRequest('ping', {}, { timeoutMs: 10 })).resolves.toEqual({
      status: 'ok',
    });

    expect(legacyTransport.sendRequest).toHaveBeenCalledWith('ping', {}, { timeoutMs: 10 });
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
      legacyTransport: {
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
