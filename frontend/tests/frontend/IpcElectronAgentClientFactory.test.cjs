/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const electronAgentClientFactoryModule = require('../../src/main/ipc/ipc_electron_agent_client_factory.cjs');
const {
  createElectronAgentClientFactoryRuntime,
} = electronAgentClientFactoryModule;

function createEndpointState() {
  return {
    getHttpUrl: jest.fn(() => 'https://primary.test'),
    getWsUrl: jest.fn(() => 'wss://primary.test/ws'),
    getCandidates: jest.fn(() => [
      {
        httpUrl: 'https://primary.test',
        wsUrl: 'wss://primary.test/ws',
      },
      {
        httpBaseUrl: 'https://fallback.test',
        wsUrl: 'wss://fallback.test/ws',
        wsOrigin: 'https://origin.test',
      },
    ]),
  };
}

describe('ipc_electron_agent_client_factory', () => {
  test('builds managed backend and desktop auto-local-runtime options through the runtime', () => {
    const constructedOptions = [];
    class FakeAgentClient {
      constructor(options) {
        constructedOptions.push(options);
      }
    }
    const WebSocketImpl = function TestSocket() {};
    const createLaunchPlan = jest.fn(() => ({
      ok: true,
      options: { command: 'python', args: ['daemon.py'] },
    }));
    const runtime = createElectronAgentClientFactoryRuntime({
      AgentClient: FakeAgentClient,
      backendEndpointState: createEndpointState(),
      getDesktopLocalRuntimeLaunchConfig: () => ({ isPackaged: true }),
      getWebSocketImpl: () => WebSocketImpl,
      isTest: false,
      createLaunchPlan,
      resolveUserDataRoot: () => 'C:/Users/test/AppData/Roaming/AgentRuntime',
    });

    runtime.createClient();

    expect(constructedOptions[0].backendEndpoints).toEqual([
      {
        backendUrl: 'https://primary.test',
        httpBaseUrl: 'https://primary.test',
        wsUrl: 'wss://primary.test/ws',
        wsOrigin: 'https://primary.test',
      },
      {
        backendUrl: 'https://fallback.test',
        httpBaseUrl: 'https://fallback.test',
        wsUrl: 'wss://fallback.test/ws',
        wsOrigin: 'https://origin.test',
      },
    ]);
    expect(constructedOptions[0].autoLocalRuntime).toEqual({
      command: 'python',
      args: ['daemon.py'],
    });
    expect(createLaunchPlan).toHaveBeenCalledWith({
      isPackaged: true,
      backendEndpoints: {
        httpUrl: 'https://primary.test',
      },
      userDataRoot: 'C:/Users/test/AppData/Roaming/AgentRuntime',
      WebSocketImpl,
    });
  });

  test('throws stable errors when desktop local-runtime launch options cannot be built', () => {
    class FakeAgentClient {}
    const runtime = createElectronAgentClientFactoryRuntime({
      AgentClient: FakeAgentClient,
      backendEndpointState: createEndpointState(),
      isTest: false,
      createLaunchPlan: () => ({ ok: false, error: 'missing daemon' }),
      resolveUserDataRoot: () => '/tmp/user-data',
    });

    expect(() => runtime.createClient()).toThrow('missing daemon');
  });

  test('creates an AgentClient with managed backend and host callbacks', () => {
    const constructedOptions = [];
    class FakeAgentClient {
      constructor(options) {
        constructedOptions.push(options);
      }
    }
    const onBackendOpen = jest.fn();
    const onBackendClose = jest.fn();
    const onBackendError = jest.fn();
    const onBackendHandshakeError = jest.fn();
    const onBackendMessageError = jest.fn();
    const onBackendSend = jest.fn();
    const onBackendFallback = jest.fn();
    const logMainRuntime = jest.fn();

    const runtime = createElectronAgentClientFactoryRuntime({
      AgentClient: FakeAgentClient,
      backendEndpointState: createEndpointState(),
      getDesktopLocalRuntimeLaunchConfig: () => null,
      getWebSocketImpl: () => null,
      reconnectIntervalMs: 1000,
      connectTimeoutMs: 10000,
      idleDisconnectTimeoutMs: 1800000,
      onBackendOpen,
      onBackendClose,
      onBackendError,
      onBackendHandshakeError,
      onBackendMessageError,
      onBackendSend,
      onBackendFallback,
      isTest: true,
      logMainRuntime,
    });
    runtime.createClient();

    expect(constructedOptions).toHaveLength(1);
    expect(constructedOptions[0]).toMatchObject({
      backendUrl: 'https://primary.test',
      httpBaseUrl: 'https://primary.test',
      wsUrl: 'wss://primary.test/ws',
      wsOrigin: 'https://primary.test',
      backendSession: 'managed',
      reconnectIntervalMs: 1000,
      connectTimeoutMs: 10000,
      idleDisconnectTimeoutMs: 1800000,
      autoStartLocalRuntime: false,
    });
    expect(constructedOptions[0].backendEndpoints).toHaveLength(2);
    expect(constructedOptions[0].onBackendOpen).toBe(onBackendOpen);
    expect(constructedOptions[0].onBackendClose).toBe(onBackendClose);
    expect(constructedOptions[0].onBackendError).toBe(onBackendError);
    expect(constructedOptions[0].onBackendHandshakeError).toBe(onBackendHandshakeError);
    expect(constructedOptions[0].onBackendMessageError).toBe(onBackendMessageError);
    expect(constructedOptions[0].onBackendSend).toBe(onBackendSend);
    expect(constructedOptions[0].onBackendFallback).toBe(onBackendFallback);
    expect(logMainRuntime).toHaveBeenCalledWith('[Main][SDK] creating_client backend=https://primary.test');
  });

  test('factory runtime resolves dynamic host options when creating clients', () => {
    const createClient = jest.fn(() => ({ client: true }));
    const WebSocketImpl = function TestSocket() {};
    const onBackendOpen = jest.fn();
    const logMainRuntime = jest.fn();
    const runtime = createElectronAgentClientFactoryRuntime({
      AgentClient: function FakeAgentClient() {},
      backendEndpointState: createEndpointState(),
      getDesktopLocalRuntimeLaunchConfig: () => ({ isPackaged: true }),
      getWebSocketImpl: () => WebSocketImpl,
      reconnectIntervalMs: 1000,
      connectTimeoutMs: 10000,
      idleDisconnectTimeoutMs: 1800000,
      onBackendOpen,
      isTest: () => true,
      createClient,
      logMainRuntime,
    });

    expect(runtime.createClient()).toEqual({ client: true });
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
      backendEndpointState: expect.any(Object),
      desktopLocalRuntimeLaunchConfig: { isPackaged: true },
      WebSocketImpl,
      reconnectIntervalMs: 1000,
      connectTimeoutMs: 10000,
      idleDisconnectTimeoutMs: 1800000,
      onBackendOpen,
      isTest: true,
      logMainRuntime,
    }));
  });

  test('ipc.cjs delegates AgentClient construction to the factory module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const factorySource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_electron_agent_client_factory.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createElectronAgentClientFactoryRuntime({');
    expect(mainSource).toContain('electronAgentClientFactoryRuntime.createClient()');
    expect(mainSource).not.toContain('function createElectronAgentClient()');
    expect(mainSource).not.toContain('new AgentClient({');
    expect(mainSource).not.toContain('autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent()');
    expect(factorySource).toContain('function createElectronAgentClientFactoryRuntime');
    expect(factorySource).toContain('new AgentClient({');
    expect(factorySource).toContain('autoLocalRuntime: buildDesktopLocalRuntimeLaunchOptionsForAgent({');
    expect(factorySource).not.toContain('  buildDesktopLocalRuntimeLaunchOptionsForAgent,');
    expect(factorySource).not.toContain('  buildDesktopLocalRuntimeOptions,');
    expect(factorySource).not.toContain('  buildManagedBackendEndpoints,');
    expect(electronAgentClientFactoryModule.createElectronAgentClient).toBeUndefined();
    expect(electronAgentClientFactoryModule.buildDesktopLocalRuntimeLaunchOptionsForAgent).toBeUndefined();
    expect(electronAgentClientFactoryModule.buildDesktopLocalRuntimeOptions).toBeUndefined();
    expect(electronAgentClientFactoryModule.buildManagedBackendEndpoints).toBeUndefined();
  });
});
