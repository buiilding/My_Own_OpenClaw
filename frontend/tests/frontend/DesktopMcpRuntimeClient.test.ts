/**
 * Covers desktop MCP runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_MCP_SERVERS: 'list-mcp-servers',
    SET_MCP_SERVER_ENABLED: 'set-mcp-server-enabled',
    REFRESH_MCP_SERVERS: 'refresh-mcp-servers',
  },
}));

import * as DesktopMcpRuntimeModule from '../../src/renderer/app/runtime/desktopMcpRuntimeClient';
import {
  DesktopMcpRuntimeClient,
} from '../../src/renderer/app/runtime/desktopMcpRuntimeClient';

describe('DesktopMcpRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  test('normalizes MCP registry payloads through runtime client commands', async () => {
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('normalizeDesktopMcpRegistry');
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('getEmptyDesktopMcpRegistry');
    expect(DesktopMcpRuntimeClient.getEmptyMcpRegistry()).toEqual({
      mcps: [],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: [],
    });
    mockInvoke
      .mockResolvedValueOnce({
        mcps: [{ id: 'memory' }],
        errors: [{ id: 'broken' }],
        mcp_errors: [{ id: 'daemon' }],
        enabled_mcp_servers: ['memory', 7, null, 'cua-driver'],
      })
      .mockResolvedValueOnce(null);

    await expect(DesktopMcpRuntimeClient.listMcpServers()).resolves.toEqual({
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
      mcp_errors: [{ id: 'daemon' }],
      enabled_mcp_servers: ['memory', 'cua-driver'],
    });

    await expect(DesktopMcpRuntimeClient.listMcpServers()).resolves.toEqual({
      mcps: [],
      errors: [],
      mcp_errors: [],
      enabled_mcp_servers: [],
    });
  });

  test('normalizes MCP enablement results with nested registries', async () => {
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('normalizeDesktopMcpEnablementResult');
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('resolveDesktopMcpEnablementRegistry');
    mockInvoke.mockResolvedValueOnce({
      success: true,
      registry: {
        mcps: [{ id: 'memory' }],
        enabled_mcp_servers: ['memory', false],
      },
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
  });

  test('throws normalized MCP enablement errors through runtime client commands', async () => {
    mockInvoke.mockResolvedValueOnce({
      success: false,
      error: ' Missing MCP server id. ',
    });

    await expect(DesktopMcpRuntimeClient.setMcpServerEnabled({
      id: '',
      enabled: true,
    })).rejects.toThrow('Missing MCP server id.');
  });

  test('builds MCP server presentation values at the runtime boundary', () => {
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('getDesktopMcpServerPresentation');
    expect(DesktopMcpRuntimeClient.getMcpServerPresentation({
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
      statusClassName: 'settings-surface-tool-status settings-surface-tool-status-error',
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
      statusClassName: 'settings-surface-tool-status',
      statusText: 'cua-driver',
    }));
  });

  test('builds MCP registry error presentation values at the runtime boundary', () => {
    expect(DesktopMcpRuntimeModule).not.toHaveProperty('getDesktopMcpRegistryErrorPresentation');
    expect(DesktopMcpRuntimeClient.getMcpRegistryErrorPresentation({
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
