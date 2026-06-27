/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');
const {
  createIpcHostRuntimeConfig,
} = require('../../src/main/ipc/ipc_host_runtime_config.cjs');

describe('ipc host runtime config', () => {
  test('configures backend endpoint runtime before debug env runtime', () => {
    const calls = [];
    const backendEndpointState = {
      configureHostedBackend: jest.fn((hostedBackend) => {
        calls.push(`backend:${hostedBackend.name}`);
      }),
    };
    const configureDebugEnvRuntime = jest.fn((debugConfig) => {
      calls.push(`debug:${debugConfig.name}`);
    });
    const runtime = createIpcHostRuntimeConfig({
      backendEndpointState,
      configureDebugEnvRuntime,
    });

    runtime.configure({
      hostedBackend: { name: 'hosted' },
      debug: { name: 'debug' },
    });

    expect(calls).toEqual([
      'backend:hosted',
      'debug:debug',
    ]);
    expect(backendEndpointState.configureHostedBackend).toHaveBeenCalledWith({ name: 'hosted' });
    expect(configureDebugEnvRuntime).toHaveBeenCalledWith({ name: 'debug' });
  });

  test('ipc.cjs delegates host runtime config fan-out to helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_host_runtime_config.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcHostRuntimeConfig({');
    expect(mainSource).toContain('ipcHostRuntimeConfig.configure(config)');
    expect(mainSource).not.toContain('backendEndpointState.configureHostedBackend(config.hostedBackend)');
    expect(mainSource).not.toContain('configureDebugEnvRuntime(config.debug)');
    expect(helperSource).toContain('function createIpcHostRuntimeConfig');
    expect(helperSource).toContain('backendEndpointState.configureHostedBackend(config.hostedBackend)');
    expect(helperSource).toContain('configureDebugEnvRuntime(config.debug)');
  });
});
