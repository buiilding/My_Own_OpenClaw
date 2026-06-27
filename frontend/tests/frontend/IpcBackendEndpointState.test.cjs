/**
 * Covers ipc backend endpoint state. behavior in the frontend test suite.
 */

const {
  createBackendEndpointRuntime,
} = require('../../src/main/ipc/ipc_backend_endpoint_state.cjs');
const fs = require('fs/promises');
const path = require('path');

function createHarness() {
  const fallback = { wsUrl: 'ws://fallback/ws', httpUrl: 'http://fallback' };
  const hosted = { wsUrl: 'wss://hosted/ws', httpUrl: 'https://hosted' };
  const local = { wsUrl: 'ws://local/ws', httpUrl: 'http://local' };
  const deps = {
    resolveBackendEndpoints: jest.fn(() => fallback),
    resolveBackendEndpointCandidates: jest.fn(() => [hosted, local]),
  };
  const endpointState = createBackendEndpointRuntime(deps);
  return {
    deps,
    endpointState,
    fallback,
    hosted,
    local,
  };
}

describe('ipc_backend_endpoint_state', () => {
  test('initializes from default endpoint resolver', () => {
    const { deps, endpointState, fallback } = createHarness();

    expect(deps.resolveBackendEndpoints).toHaveBeenCalledTimes(1);
    expect(endpointState.getEndpoint()).toEqual(fallback);
    expect(endpointState.getWsUrl()).toBe('ws://fallback/ws');
    expect(endpointState.getHttpUrl()).toBe('http://fallback');
  });

  test('refreshes candidates and activates the first candidate', () => {
    const { deps, endpointState, hosted, local } = createHarness();

    expect(endpointState.refresh({ isPackaged: true })).toEqual(hosted);

    expect(deps.resolveBackendEndpointCandidates).toHaveBeenCalledWith(process.env, {
      isPackaged: true,
    });
    expect(endpointState.getCandidates()).toEqual([hosted, local]);
    expect(endpointState.getEndpoint()).toEqual(hosted);
  });

  test('advances and rejects missing endpoint candidates', () => {
    const { endpointState, local } = createHarness();

    endpointState.refresh();

    expect(endpointState.advance()).toBe(true);
    expect(endpointState.getEndpoint()).toEqual(local);
    expect(endpointState.advance()).toBe(false);
    expect(endpointState.getEndpoint()).toEqual(local);
  });

  test('falls back to default resolver when candidate list is empty', () => {
    const fallback = { wsUrl: 'ws://fallback/ws', httpUrl: 'http://fallback' };
    const endpointState = createBackendEndpointRuntime({
      resolveBackendEndpoints: jest.fn(() => fallback),
      resolveBackendEndpointCandidates: jest.fn(() => []),
    });

    expect(endpointState.refresh()).toEqual(fallback);
    expect(endpointState.getCandidates()).toEqual([]);
  });

  test('runtime configures hosted backend before refreshing endpoint candidates', () => {
    const fallback = { wsUrl: 'ws://fallback/ws', httpUrl: 'http://fallback' };
    const hosted = { wsUrl: 'wss://hosted/ws', httpUrl: 'https://hosted' };
    const calls = [];
    const runtime = createBackendEndpointRuntime({
      configureBackendEndpointRuntime: jest.fn((hostedBackend) => {
        calls.push(`configure:${hostedBackend.baseUrl}`);
      }),
      resolveBackendEndpoints: jest.fn(() => fallback),
      resolveBackendEndpointCandidates: jest.fn(() => {
        calls.push('refresh');
        return [hosted];
      }),
    });

    expect(runtime.configureHostedBackend({ baseUrl: 'https://hosted' })).toEqual(hosted);
    expect(calls).toEqual([
      'configure:https://hosted',
      'refresh',
    ]);
    expect(runtime.getEndpoint()).toEqual(hosted);
  });

  test('ipc.cjs delegates hosted backend configuration to endpoint runtime', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_endpoint_state.cjs'),
      'utf8',
    );
    const hostConfigSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_host_runtime_config.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createBackendEndpointRuntime({');
    expect(mainSource).toContain('createIpcHostRuntimeConfig({');
    expect(mainSource).not.toContain('backendEndpointState.configureHostedBackend(config.hostedBackend)');
    expect(mainSource).not.toContain('createBackendEndpointState({');
    expect(mainSource).not.toContain('configureBackendEndpointRuntime(config.hostedBackend)');
    expect(helperSource).toContain('function createBackendEndpointRuntime');
    expect(helperSource).toContain('configureBackendEndpointRuntime(hostedBackend)');
    expect(helperSource).not.toContain('  createBackendEndpointState,');
    expect(hostConfigSource).toContain('backendEndpointState.configureHostedBackend(config.hostedBackend)');
  });
});
