/**
 * Covers extension and MCP IPC handler registration behavior.
 */

const fs = require('fs/promises');
const path = require('path');

const {
  createExtensionMcpHandlersRuntime,
} = require('../../src/main/ipc/ipc_extension_mcp_handlers.cjs');

function createHarness(overrides = {}) {
  const handlers = {};
  const ipcMain = {
    handle: jest.fn((channel, handler) => {
      handlers[channel] = handler;
    }),
  };
  const config = overrides.config || {
    agent_enabled_mcp_servers: ['mcp:memory'],
  };
  const registerMcps = jest.fn(async () => ({ success: true }));
  const localRuntime = { registerMcp: jest.fn() };
  const deps = {
    loadPublicExtensionRegistry: jest.fn(() => ({
      contributionRoot: '/extensions',
      plugins: [{ id: 'plugin-a' }],
      skills: [{ id: 'skill-a' }],
      mcps: [{ id: 'manifest-mcp' }],
      extension_errors: [],
    })),
    listMcpServersForConfig: jest.fn(() => ({
      mcps: [{ id: 'memory', effective_enabled: true }],
      mcp_errors: [],
    })),
    updateMcpServerEnablementForConfig: jest.fn(async () => ({ success: true })),
    getEnabledMcpServerSpecsForConfig: jest.fn(() => [{ id: 'memory' }]),
    refreshMcpServersForLatestConfig: jest.fn(async () => ({
      mcps: [{ id: 'memory', status: { state: 'ready' } }],
    })),
    persistDesktopUiConfigToDisk: jest.fn(async () => ({ success: true })),
    getDesktopUiConfigForMcpRegistry: jest.fn(() => config),
    ensureAgent: jest.fn(async () => ({
      localRuntime,
      registerMcps,
    })),
    mcpClientInfo: { name: 'Desktop Agent Host', version: 'test' },
    isTest: true,
    ...overrides.runtime,
  };

  const runtime = createExtensionMcpHandlersRuntime(deps);

  runtime.register({ ipcMain });

  return {
    config,
    deps,
    handlers,
    ipcMain,
    registerMcps,
    runtime,
  };
}

describe('extension and MCP IPC handlers', () => {
  test('registers extension and MCP registry channels', () => {
    const { handlers } = createHarness();

    expect(typeof handlers['list-agent-extensions']).toBe('function');
    expect(typeof handlers['list-mcp-servers']).toBe('function');
    expect(typeof handlers['set-mcp-server-enabled']).toBe('function');
    expect(typeof handlers['refresh-mcp-servers']).toBe('function');
  });

  test('lists public extension metadata with the current MCP registry snapshot', async () => {
    const { config, deps, handlers } = createHarness();

    await expect(handlers['list-agent-extensions']()).resolves.toEqual({
      contributionRoot: '/extensions',
      plugins: [{ id: 'plugin-a' }],
      skills: [{ id: 'skill-a' }],
      mcps: [{ id: 'memory', effective_enabled: true }],
      extension_errors: [],
    });

    expect(deps.loadPublicExtensionRegistry).toHaveBeenCalledTimes(1);
    expect(deps.listMcpServersForConfig).toHaveBeenCalledWith({ config });
  });

  test('lists MCP servers from the latest desktop UI config', async () => {
    const { config, deps, handlers } = createHarness();

    await expect(handlers['list-mcp-servers']()).resolves.toEqual({
      mcps: [{ id: 'memory', effective_enabled: true }],
      mcp_errors: [],
    });

    expect(deps.listMcpServersForConfig).toHaveBeenCalledWith({ config });
  });

  test('rejects empty MCP server ids before persistence', async () => {
    const { deps, handlers } = createHarness();

    await expect(handlers['set-mcp-server-enabled'](null, {
      id: '  ',
      enabled: true,
    })).resolves.toEqual({
      success: false,
      error: 'Missing MCP server id.',
    });

    expect(deps.updateMcpServerEnablementForConfig).not.toHaveBeenCalled();
  });

  test('persists MCP enablement through the config-preserving runtime path', async () => {
    const { config, deps, handlers } = createHarness();

    await expect(handlers['set-mcp-server-enabled'](null, {
      id: ' mcp:memory ',
      enabled: true,
    })).resolves.toEqual({ success: true });

    expect(deps.updateMcpServerEnablementForConfig).toHaveBeenCalledWith(expect.objectContaining({
      config,
      serverId: 'mcp:memory',
      enabled: true,
      resolveLocalRuntime: null,
      clientInfo: { name: 'Desktop Agent Host', version: 'test' },
    }));

    const { persistConfig } = deps.updateMcpServerEnablementForConfig.mock.calls[0][0];
    await persistConfig({ agent_enabled_mcp_servers: ['mcp:memory'] });
    expect(deps.persistDesktopUiConfigToDisk).toHaveBeenCalledWith(
      { agent_enabled_mcp_servers: ['mcp:memory'] },
      { preserveMcpEnablement: false },
    );
  });

  test('refreshes SDK MCP registration after a successful runtime toggle', async () => {
    const { config, deps, handlers, registerMcps } = createHarness({
      runtime: {
        isTest: false,
      },
    });

    const result = await handlers['set-mcp-server-enabled'](null, {
      id: 'mcp:memory',
      enabled: false,
    });

    expect(result).toEqual({
      success: true,
      registry: {
        mcps: [{ id: 'memory', status: { state: 'ready' } }],
      },
    });
    expect(deps.updateMcpServerEnablementForConfig).toHaveBeenCalledWith(expect.objectContaining({
      config,
      serverId: 'mcp:memory',
      enabled: false,
      resolveLocalRuntime: expect.any(Function),
    }));
    expect(deps.ensureAgent).toHaveBeenCalledWith({ reason: 'mcp-manifest-refresh' });
    expect(deps.getEnabledMcpServerSpecsForConfig).toHaveBeenCalledWith({ config });
    expect(registerMcps).toHaveBeenCalledWith([{ id: 'memory' }], { replace: true });
    expect(deps.refreshMcpServersForLatestConfig).toHaveBeenCalledWith(
      'mcp-toggle-post-sdk-refresh',
    );
  });

  test('refresh handler delegates to the latest MCP registry runtime', async () => {
    const { deps, handlers } = createHarness();

    await expect(handlers['refresh-mcp-servers']()).resolves.toEqual({
      mcps: [{ id: 'memory', status: { state: 'ready' } }],
    });

    expect(deps.refreshMcpServersForLatestConfig).toHaveBeenCalledWith('mcp-refresh');
  });

  test('runtime registers extension and MCP handlers with late client identity resolution', async () => {
    const handlers = {};
    const ipcMain = {
      handle: jest.fn((channel, handler) => {
        handlers[channel] = handler;
      }),
    };
    const mcpClientInfo = jest.fn(() => ({ name: 'Runtime Host', version: 'late' }));
    const updateMcpServerEnablementForConfig = jest.fn(async () => ({ success: true }));
    const runtime = createExtensionMcpHandlersRuntime({
      loadPublicExtensionRegistry: jest.fn(() => ({
        contributionRoot: '/extensions',
        plugins: [],
        skills: [],
        mcps: [],
        extension_errors: [],
      })),
      listMcpServersForConfig: jest.fn(() => ({ mcps: [], mcp_errors: [] })),
      updateMcpServerEnablementForConfig,
      getEnabledMcpServerSpecsForConfig: jest.fn(() => []),
      refreshMcpServersForLatestConfig: jest.fn(async () => ({ mcps: [] })),
      persistDesktopUiConfigToDisk: jest.fn(async () => ({ success: true })),
      getDesktopUiConfigForMcpRegistry: jest.fn(() => ({ agent_enabled_mcp_servers: [] })),
      ensureAgent: jest.fn(),
      mcpClientInfo,
      isTest: true,
    });

    runtime.register({ ipcMain });

    await expect(handlers['set-mcp-server-enabled'](null, {
      id: 'mcp:runtime',
      enabled: true,
    })).resolves.toEqual({ success: true });

    expect(mcpClientInfo).toHaveBeenCalledTimes(1);
    expect(updateMcpServerEnablementForConfig).toHaveBeenCalledWith(expect.objectContaining({
      clientInfo: { name: 'Runtime Host', version: 'late' },
      serverId: 'mcp:runtime',
      enabled: true,
    }));
  });

  test('ipc.cjs delegates extension and MCP channel bodies to the helper module', async () => {
    const mainSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_extension_mcp_handlers.cjs'),
      'utf8',
    );
    const initializationSource = await fs.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_initialization_runtime.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createExtensionMcpHandlersRuntime({');
    expect(mainSource).not.toContain('extensionMcpHandlersRuntime.register({ ipcMain })');
    expect(initializationSource).toContain('extensionMcpHandlersRuntime.register({ ipcMain })');
    expect(mainSource).not.toContain('registerExtensionMcpHandlers({');
    expect(mainSource).not.toContain("ipcMain.handle('list-agent-extensions'");
    expect(mainSource).not.toContain("ipcMain.handle('list-mcp-servers'");
    expect(mainSource).not.toContain("ipcMain.handle('set-mcp-server-enabled'");
    expect(mainSource).not.toContain("ipcMain.handle('refresh-mcp-servers'");
    expect(helperSource).toContain('function createExtensionMcpHandlersRuntime');
    expect(helperSource).toContain('return registerExtensionMcpHandlers({');
    expect(helperSource).toContain("ipcMain.handle('list-agent-extensions'");
    expect(helperSource).toContain("ipcMain.handle('set-mcp-server-enabled'");
    const helperModule = require('../../src/main/ipc/ipc_extension_mcp_handlers.cjs');
    expect(helperModule.registerExtensionMcpHandlers).toBeUndefined();
  });
});
