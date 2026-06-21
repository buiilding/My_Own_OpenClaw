/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const {
  DEFAULT_IPC_HOST_COPY,
  createIpcHostCopyRuntime,
} = require('../../frontend/src/main/ipc/ipc_host_copy_runtime.cjs');

describe('ipc_host_copy_runtime', () => {
  test('uses generic host copy defaults before app skin configuration', () => {
    const runtime = createIpcHostCopyRuntime();

    expect(runtime.getCopy()).toBe(DEFAULT_IPC_HOST_COPY);
    expect(runtime.getSdkAgentName()).toBe('Desktop Agent');
    expect(runtime.getMcpClientInfo()).toEqual({
      name: 'Desktop Runtime',
      version: '0.0.0',
    });
    expect(runtime.getQueryEvents()).toEqual({});
  });

  test('configures identity and query-event copy from host skin input', () => {
    const identity = {
      sdkAgentName: 'Sample Agent',
      mcpClientInfo: {
        name: 'Sample Runtime',
        version: '1.2.3',
      },
    };
    const queryEvents = {
      sendFailure: 'Nope.',
    };
    const runtime = createIpcHostCopyRuntime();

    runtime.configure({
      identity,
      queryEvents,
    });

    expect(runtime.getIdentity()).toBe(identity);
    expect(runtime.getSdkAgentName()).toBe('Sample Agent');
    expect(runtime.getMcpClientInfo()).toBe(identity.mcpClientInfo);
    expect(runtime.getQueryEvents()).toBe(queryEvents);
  });

  test('falls back each host-copy section independently', () => {
    const queryEvents = {
      interruptedAfterAccept: 'Reconnect.',
    };
    const runtime = createIpcHostCopyRuntime({
      identity: null,
      queryEvents,
    });

    expect(runtime.getIdentity()).toBe(DEFAULT_IPC_HOST_COPY.identity);
    expect(runtime.getQueryEvents()).toBe(queryEvents);

    runtime.configure({
      identity: {
        sdkAgentName: 'Custom Agent',
        mcpClientInfo: { name: 'Custom Runtime' },
      },
      queryEvents: [],
    });

    expect(runtime.getSdkAgentName()).toBe('Custom Agent');
    expect(runtime.getQueryEvents()).toBe(DEFAULT_IPC_HOST_COPY.queryEvents);
  });

  test('ipc.cjs delegates host-copy state and defaults to the helper', () => {
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = fs.readFileSync(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_host_copy_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createIpcHostCopyRuntime()');
    expect(mainSource).toContain('ipcHostCopyRuntime.configure(copy)');
    expect(mainSource).toContain('ipcHostCopyRuntime.getSdkAgentName()');
    expect(mainSource).toContain('ipcHostCopyRuntime.getMcpClientInfo()');
    expect(mainSource).toContain('ipcHostCopyRuntime.getQueryEvents()');
    expect(mainSource).not.toContain('const DEFAULT_IPC_HOST_COPY = Object.freeze');
    expect(helperSource).toContain('const DEFAULT_IPC_HOST_COPY = Object.freeze');
  });
});
