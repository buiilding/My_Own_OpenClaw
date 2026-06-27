/** @jest-environment node */

const fs = require('fs/promises');
const path = require('path');

const {
  createAgentClientLifecycleRuntime,
} = require('../../src/main/ipc/ipc_agent_client_lifecycle.cjs');

describe('ipc_agent_client_lifecycle', () => {
  const retiredFactorySignature = `function ${['createAgentClient', 'Lifecycle'].join('')}(`;

  test('creates and logs the AgentClient once, then reuses it', () => {
    const client = { id: 'client-1' };
    const createAgentClient = jest.fn(() => client);
    const logMainRuntime = jest.fn();
    const lifecycle = createAgentClientLifecycleRuntime({
      createAgentClient,
      logMainRuntime,
    });

    expect(lifecycle.getAgentClientIfInitialized()).toBeNull();
    expect(lifecycle.getAgentClient()).toBe(client);
    expect(lifecycle.getAgentClient()).toBe(client);

    expect(createAgentClient).toHaveBeenCalledTimes(1);
    expect(logMainRuntime).toHaveBeenCalledWith('[Main][SDK] client_initialized');
    expect(lifecycle.getAgentClientIfInitialized()).toBe(client);
  });

  test('shutdownAndReset forwards local-runtime shutdown and clears the cached client', () => {
    const client = {
      shutdownLocalRuntime: jest.fn(),
    };
    const lifecycle = createAgentClientLifecycleRuntime({
      createAgentClient: jest.fn(() => client),
    });

    lifecycle.getAgentClient();
    lifecycle.shutdownAndReset();

    expect(client.shutdownLocalRuntime).toHaveBeenCalledTimes(1);
    expect(lifecycle.getAgentClientIfInitialized()).toBeNull();
  });

  test('reset clears the cached client without shutdown', () => {
    const client = {
      shutdownLocalRuntime: jest.fn(),
    };
    const lifecycle = createAgentClientLifecycleRuntime({
      createAgentClient: jest.fn(() => client),
    });

    lifecycle.getAgentClient();
    lifecycle.reset();

    expect(client.shutdownLocalRuntime).not.toHaveBeenCalled();
    expect(lifecycle.getAgentClientIfInitialized()).toBeNull();
  });

  test('ipc.cjs delegates AgentClient cache state to the lifecycle helper', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_client_lifecycle.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentClientLifecycleRuntime({');
    expect(mainSource).not.toContain('let agentClient = null');
    expect(mainSource).not.toContain('agentClient = createElectronAgentClient()');
    expect(helperSource).toContain('function createAgentClientLifecycleRuntime');
    expect(helperSource).not.toContain(retiredFactorySignature);
    expect(helperSource).toContain('let agentClient = null;');
    expect(helperSource).toContain('agentClient = createAgentClient();');
  });
});
