/**
 * Covers desktop MCP runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_MCP_SERVERS: 'list-mcp-servers',
    SET_MCP_SERVER_ENABLED: 'set-mcp-server-enabled',
    REFRESH_MCP_SERVERS: 'refresh-mcp-servers',
  },
}));

import {
  DesktopMcpRuntimeClient,
  getDesktopMcpRegistryErrorPresentation,
  getDesktopMcpServerPresentation,
  normalizeDesktopMcpEnablementResult,
  normalizeDesktopMcpRegistry,
  resolveDesktopMcpEnablementRegistry,
} from '../../frontend/src/renderer/app/runtime/desktopMcpRuntimeClient';

describe('DesktopMcpRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('normalizes MCP registry payloads at the runtime boundary', () => {
    expect(normalizeDesktopMcpRegistry({
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
      mcp_errors: [{ id: 'daemon' }],
      enabled_mcp_servers: ['memory', 7, null, 'cua-driver'],
    })).toEqual({
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
      mcp_errors: [{ id: 'daemon' }],
      enabled_mcp_servers: ['memory', 'cua-driver'],
    });

    expect(normalizeDesktopMcpRegistry(null)).toEqual({
      mcps: [],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: [],
    });
  });

  test('normalizes MCP enablement results with nested registries', () => {
    expect(normalizeDesktopMcpEnablementResult({
      success: true,
      registry: {
        mcps: [{ id: 'memory' }],
        enabled_mcp_servers: ['memory', false],
      },
    })).toEqual({
      ok: true,
      errorMessage: null,
      registry: {
        mcps: [{ id: 'memory' }],
        errors: [],
        mcp_errors: [],
        enabled_mcp_servers: ['memory'],
      },
    });

    expect(normalizeDesktopMcpEnablementResult({
      success: false,
      error: ' Missing MCP server id. ',
    })).toEqual({
      ok: false,
      errorMessage: 'Missing MCP server id.',
      registry: {
        mcps: [],
        errors: [],
        mcp_errors: [],
        enabled_mcp_servers: [],
      },
    });
  });

  test('resolves enablement results to registries or throws normalized errors', () => {
    expect(resolveDesktopMcpEnablementRegistry({
      success: true,
      registry: { mcps: [{ id: 'memory' }], enabled_mcp_servers: ['memory', false] },
    })).toEqual({
      mcps: [{ id: 'memory' }],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: ['memory'],
    });

    expect(() => resolveDesktopMcpEnablementRegistry({
      success: false,
      error: ' Missing MCP server id. ',
    })).toThrow('Missing MCP server id.');
  });

  test('builds MCP server presentation values at the runtime boundary', () => {
    expect(getDesktopMcpServerPresentation({
      id: 'memory',
      extension_id: 'mcp:memory',
      name: ' Memory ',
      command: 'node',
      args: ['server.cjs'],
      tool_prefix: 'memory',
      effective_enabled: true,
      status: { state: 'error', label: ' Error ', reason: ' Missing binary. ' },
      tools: [{ name: 'search' }],
    })).toEqual({
      key: 'mcp:memory',
      name: 'Memory',
      enablementId: 'mcp:memory',
      enabled: true,
      statusLabel: 'Error',
      statusClassName: 'clone-settings-tool-status clone-settings-tool-status-error',
      statusText: 'Missing binary.',
      debugSpec: {
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
        tool_prefix: 'memory',
        tools: ['search'],
      },
    });

    expect(DesktopMcpRuntimeClient.getMcpServerPresentation({
      id: 'cua',
      command: 'cua-driver',
      status: {},
      tools: 'offline',
    })).toEqual(expect.objectContaining({
      key: 'cua',
      name: 'cua',
      enablementId: 'cua',
      enabled: false,
      statusLabel: 'Unknown',
      statusClassName: 'clone-settings-tool-status',
      statusText: 'cua-driver',
    }));
  });

  test('builds MCP registry error presentation values at the runtime boundary', () => {
    expect(getDesktopMcpRegistryErrorPresentation({
      kind: 'mcp',
      id: 'memory',
      reason: 'spawn failed',
    })).toEqual({
      key: 'mcp-memory-spawn failed',
      text: 'mcp memory: spawn failed',
    });
    expect(DesktopMcpRuntimeClient.getMcpRegistryErrorPresentation(null)).toEqual({
      key: 'extension-unknown-',
      text: 'extension unknown',
    });
  });

  test('list, refresh, and enablement commands return normalized payloads', async () => {
    mockInvoke
      .mockResolvedValueOnce({ mcps: [{ id: 'memory' }], enabled_mcp_servers: ['memory', 1] })
      .mockResolvedValueOnce({ errors: ['offline'] })
      .mockResolvedValueOnce({
        success: true,
        registry: { mcps: [{ id: 'memory' }], enabled_mcp_servers: ['memory'] },
      });

    await expect(DesktopMcpRuntimeClient.listMcpServers()).resolves.toEqual({
      mcps: [{ id: 'memory' }],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: ['memory'],
    });
    await expect(DesktopMcpRuntimeClient.refreshMcpServers()).resolves.toEqual({
      mcps: [],
      errors: ['offline'],
      mcp_errors: [],
      enabled_mcp_servers: [],
    });
    await expect(DesktopMcpRuntimeClient.setMcpServerEnabled({
      id: 'memory',
      enabled: true,
    })).resolves.toEqual({
      mcps: [{ id: 'memory' }],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: ['memory'],
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'list-mcp-servers');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'refresh-mcp-servers');
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'set-mcp-server-enabled', {
      id: 'memory',
      enabled: true,
    });
  });
});
