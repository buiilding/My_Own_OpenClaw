/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createBackendConnectionGateState,
} = require('../../src/main/ipc/ipc_backend_connection_gate_state.cjs');

describe('ipc_backend_connection_gate_state', () => {
  test('stores connection and first-query gate state independently', () => {
    const state = createBackendConnectionGateState({
      initialConnected: true,
      initialFirstQuery: false,
    });

    expect(state.getSnapshot()).toEqual({
      isConnected: true,
      isFirstQuery: false,
    });

    state.setConnected(false);
    state.setFirstQuery(true);

    expect(state.getConnected()).toBe(false);
    expect(state.getFirstQuery()).toBe(true);
    expect(state.getSnapshot()).toEqual({
      isConnected: false,
      isFirstQuery: true,
    });

    state.setConnected(true);
    state.setFirstQuery(false);
    state.reset();
    expect(state.getSnapshot()).toEqual({
      isConnected: false,
      isFirstQuery: true,
    });
  });

  test('ipc.cjs delegates backend connection and first-query gate storage to the helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_backend_connection_gate_state.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createBackendConnectionGateState()');
    expect(mainSource).toContain('backendConnectionGateState.getConnected()');
    expect(mainSource).toContain('backendConnectionGateState.setConnected(');
    expect(mainSource).toContain('backendConnectionGateState.getFirstQuery()');
    expect(mainSource).toContain('backendConnectionGateState.setFirstQuery(');
    expect(mainSource).not.toContain('let isConnected = false');
    expect(mainSource).not.toContain('let isFirstQuery = true');
    expect(mainSource).not.toContain('isConnected = value');
    expect(mainSource).not.toContain('isFirstQuery = value');
    expect(mainSource).not.toContain('isFirstQuery = nextValue');
    expect(helperSource).toContain('let isConnected = initialConnected;');
    expect(helperSource).toContain('let isFirstQuery = initialFirstQuery;');
  });
});
