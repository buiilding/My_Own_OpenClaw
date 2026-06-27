/** @jest-environment node */

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  listMcpServersForConfig,
  refreshMcpServersForConfig,
  updateMcpServerEnablementForConfig,
} = require('../../src/main/extensions/mcp_control.cjs');
const {
  clearExtensionRuntimeCache,
} = require('../../src/main/extensions/extension_manifest.cjs');
const {
  clearMcpRuntimeCache,
} = require('../../src/main/extensions/mcp_runtime.cjs');
const {
  MCP_ENABLEMENT_DIAGNOSTICS_PATH,
} = require('../../src/main/diagnostics/app_diagnostics_store.cjs');

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readDiagnosticEvents({ pathFilter = '', limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 1000);
  const where = pathFilter ? `WHERE path = ${sqlString(pathFilter)}` : '';
  const result = childProcess.spawnSync('sqlite3', ['-json', process.env.WINDIE_APP_DIAGNOSTICS_DB, `
    SELECT trace_id AS traceId,
           stage,
           status,
           duration_ms AS durationMs,
           data
    FROM diagnostic_events
    ${where}
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `], {
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `sqlite3 exited with status ${result.status}`);
  }
  return JSON.parse(result.stdout || '[]').map(event => ({
    ...event,
    data: typeof event.data === 'string' && event.data.trim()
      ? JSON.parse(event.data)
      : {},
  }));
}

function writeCuaMcpRegistry() {
  const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cua-mcp-'));
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mcp-diagnostics-'));
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
    const config = { agent_enabled_mcp_servers: ['mcp:cua-driver'] };
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

  test('refreshes enabled MCPs through the local runtime when available', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const config = { agent_enabled_mcp_servers: ['mcp:cua-driver'] };
    const registerMcp = jest.fn(async () => ({
      success: true,
      registered_tools: [{
        name: 'cua_driver__click',
        mcp_server_id: 'cua-driver',
      }],
      errors: [],
      statuses: [{
        server_id: 'cua-driver',
        state: 'ready',
        tool_count: 1,
      }],
    }));
    const listTools = jest.fn(async () => ({
      version: 1,
      tools: [{
        name: 'cua_driver__click',
        mcp_server_id: 'cua-driver',
      }],
    }));

    const registry = await refreshMcpServersForConfig({
      config,
      contributionsDir: contributionRoot,
      localRuntime: { registerMcp, listTools },
      createClient: () => {
        throw new Error('Electron MCP discovery should not run');
      },
    });

    expect(registerMcp).toHaveBeenCalledWith({
      replace: true,
      servers: [expect.objectContaining({
        id: 'cua-driver',
        command: 'cua-driver',
        args: ['mcp'],
      })],
    });
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(registry.mcps[0].status).toEqual(expect.objectContaining({
      state: 'ready',
      label: 'Ready',
    }));
  });

  test('disabling a gated MCP reconciles the local runtime with no enabled servers', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const persistConfig = jest.fn(async () => ({ success: true }));
    const registerMcp = jest.fn(async () => ({
      success: true,
      registered_tools: [],
      errors: [],
      statuses: [],
    }));
    const listTools = jest.fn(async () => ({ version: 1, tools: [] }));
    const config = { agent_enabled_mcp_servers: ['mcp:cua-driver'] };

    const result = await updateMcpServerEnablementForConfig({
      config,
      serverId: 'mcp:cua-driver',
      enabled: false,
      persistConfig,
      contributionsDir: contributionRoot,
      localRuntime: { registerMcp, listTools },
    });

    expect(result.success).toBe(true);
    expect(persistConfig).toHaveBeenCalledWith(expect.objectContaining({
      agent_enabled_mcp_servers: [],
    }));
    expect(registerMcp).toHaveBeenCalledWith({
      replace: true,
      servers: [],
    });
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(result.registry.mcps[0]).toEqual(expect.objectContaining({
      effective_enabled: false,
      status: expect.objectContaining({
        state: 'off',
        label: 'Off',
      }),
    }));
  });

  test('records enablement diagnostics around dashboard toggles', async () => {
    const contributionRoot = writeCuaMcpRegistry();
    const persistConfig = jest.fn(async () => ({ success: true }));
    const registerMcp = jest.fn(async () => ({
      success: true,
      registered_tools: [{
        name: 'cua_driver__click',
        mcp_server_id: 'cua-driver',
      }],
      errors: [],
      statuses: [{
        server_id: 'cua-driver',
        state: 'ready',
        tool_count: 1,
      }],
    }));
    const listTools = jest.fn(async () => ({
      version: 1,
      tools: [{
        name: 'cua_driver__click',
        mcp_server_id: 'cua-driver',
      }],
    }));

    const result = await updateMcpServerEnablementForConfig({
      config: {},
      serverId: 'mcp:cua-driver',
      enabled: true,
      persistConfig,
      contributionsDir: contributionRoot,
      localRuntime: { registerMcp, listTools },
    });

    expect(result.success).toBe(true);
    const events = readDiagnosticEvents({
      pathFilter: MCP_ENABLEMENT_DIAGNOSTICS_PATH,
      limit: 10,
    });
    expect(events.map((event) => event.stage)).toEqual(expect.arrayContaining([
      'toggle_requested',
      'config_persisted',
      'capability_manifest.persist',
      'registry_refreshed',
      'capability_manifest.rebuild',
    ]));
    const registryEvent = events.find((event) => event.stage === 'registry_refreshed');
    expect(registryEvent.data).toEqual(expect.objectContaining({
      serverId: 'mcp:cua-driver',
      phase: 'registry_refresh',
      requestedEnabled: true,
      enabledServerCount: 1,
      registryServerCount: 1,
      registryReadyCount: 1,
      registryErrorCount: 0,
      mcpToolCount: 1,
    }));
  });
});
