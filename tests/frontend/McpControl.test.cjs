/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  listMcpServersForConfig,
  refreshMcpServersForConfig,
  setMcpServerEnabledInConfig,
  updateMcpServerEnablementForConfig,
} = require('../../frontend/src/main/extensions/mcp_control.cjs');
const {
  clearExtensionRuntimeCache,
} = require('../../frontend/src/main/extensions/extension_manifest.cjs');
const {
  clearMcpRuntimeCache,
} = require('../../frontend/src/main/extensions/mcp_runtime.cjs');

function writeCuaMcpRegistry() {
  const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-cua-mcp-'));
  const mcpDir = path.join(contributionRoot, 'mcps', 'cua-driver');
  fs.mkdirSync(mcpDir, { recursive: true });
  fs.writeFileSync(
    path.join(mcpDir, 'mcp.json'),
    JSON.stringify({
      id: 'cua-driver',
      name: 'CUA Driver',
      command: 'cua-driver',
      args: ['mcp'],
      tool_prefix: 'cua_driver',
      requires_user_enable: true,
    }),
  );
  return contributionRoot;
}

describe('MCP control runtime', () => {
  let previousDbPath;
  let tempDir;

  beforeEach(() => {
    previousDbPath = process.env.WINDIE_APP_DIAGNOSTICS_DB;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-mcp-diagnostics-'));
    process.env.WINDIE_APP_DIAGNOSTICS_DB = path.join(tempDir, 'diagnostics.db');
  });

  afterEach(() => {
    clearExtensionRuntimeCache();
    clearMcpRuntimeCache();
    if (previousDbPath === undefined) {
      delete process.env.WINDIE_APP_DIAGNOSTICS_DB;
    } else {
      process.env.WINDIE_APP_DIAGNOSTICS_DB = previousDbPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('lists CUA Driver as visible but off by default', () => {
    const contributionRoot = writeCuaMcpRegistry();
    const registry = listMcpServersForConfig({ contributionsDir: contributionRoot });

    expect(registry.mcps).toEqual([
      expect.objectContaining({
        id: 'cua-driver',
        command: 'cua-driver',
        requires_user_enable: true,
        user_enabled: false,
        effective_enabled: false,
        status: expect.objectContaining({
          state: 'off',
          label: 'Off',
        }),
      }),
    ]);
  });

  test('classifies missing CUA Driver binary without exposing fallback tools', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const config = setMcpServerEnabledInConfig({}, 'mcp:cua-driver', true);
    const registry = await refreshMcpServersForConfig({
      config,
      contributionsDir: contributionRoot,
      createClient: () => ({
        listTools: jest.fn(async () => {
          throw new Error('spawn cua-driver ENOENT');
        }),
      }),
    });

    expect(registry.mcps[0]).toEqual(expect.objectContaining({
      user_enabled: true,
      effective_enabled: true,
      status: expect.objectContaining({
        state: 'not_installed',
        label: 'Not installed',
      }),
      tools: [],
    }));
    expect(registry.mcp_errors).toEqual([
      { server_id: 'cua-driver', reason: 'spawn cua-driver ENOENT' },
    ]);
  });

  test('refreshes discovery immediately after enabling a gated MCP', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const persistConfig = jest.fn(async () => ({ success: true }));
    const listTools = jest.fn(async () => ([{
      name: 'click',
      description: 'Click screen coordinates.',
      inputSchema: { type: 'object', properties: {} },
    }]));

    const result = await updateMcpServerEnablementForConfig({
      config: {},
      serverId: 'mcp:cua-driver',
      enabled: true,
      persistConfig,
      contributionsDir: contributionRoot,
      createClient: () => ({ listTools }),
    });

    expect(result.success).toBe(true);
    expect(persistConfig).toHaveBeenCalledWith(expect.objectContaining({
      agent_enabled_mcp_servers: ['mcp:cua-driver'],
    }));
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(result.registry.mcps[0]).toEqual(expect.objectContaining({
      effective_enabled: true,
      status: expect.objectContaining({
        state: 'ready',
        label: 'Ready',
      }),
    }));
    expect(result.registry.mcps[0].tools).toEqual([]);
  });

  test('disabling a gated MCP clears status without running discovery', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const persistConfig = jest.fn(async () => ({ success: true }));
    const listTools = jest.fn();
    const config = setMcpServerEnabledInConfig({}, 'mcp:cua-driver', true);

    const result = await updateMcpServerEnablementForConfig({
      config,
      serverId: 'mcp:cua-driver',
      enabled: false,
      persistConfig,
      contributionsDir: contributionRoot,
      createClient: () => ({ listTools }),
    });

    expect(result.success).toBe(true);
    expect(persistConfig).toHaveBeenCalledWith(expect.objectContaining({
      agent_enabled_mcp_servers: [],
    }));
    expect(listTools).not.toHaveBeenCalled();
    expect(result.registry.mcps[0]).toEqual(expect.objectContaining({
      effective_enabled: false,
      status: expect.objectContaining({
        state: 'off',
        label: 'Off',
      }),
    }));
  });
});
