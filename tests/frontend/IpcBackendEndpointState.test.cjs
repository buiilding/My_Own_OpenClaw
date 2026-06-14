/**
 * Covers ipc backend endpoint state. behavior in the frontend test suite.
 */

const {
  createBackendEndpointState,
} = require('../../frontend/src/main/ipc/ipc_backend_endpoint_state.cjs');

function createHarness() {
  const fallback = { wsUrl: 'ws://fallback/ws', httpUrl: 'http://fallback' };
  const hosted = { wsUrl: 'wss://hosted/ws', httpUrl: 'https://hosted' };
  const local = { wsUrl: 'ws://local/ws', httpUrl: 'http://local' };
  const deps = {
    resolveBackendEndpoints: jest.fn(() => fallback),
    resolveBackendEndpointCandidates: jest.fn(() => [hosted, local]),
  };
  const endpointState = createBackendEndpointState(deps);
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
    const endpointState = createBackendEndpointState({
      resolveBackendEndpoints: jest.fn(() => fallback),
      resolveBackendEndpointCandidates: jest.fn(() => []),
    });

    expect(endpointState.refresh()).toEqual(fallback);
    expect(endpointState.getCandidates()).toEqual([]);
  });
});
