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
  normalizeDesktopMcpEnablementResult,
  normalizeDesktopMcpRegistry,
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
      success: true,
      error: undefined,
      registry: {
        mcps: [{ id: 'memory' }],
        errors: [],
        mcp_errors: [],
        enabled_mcp_servers: ['memory'],
      },
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
      success: true,
      error: undefined,
      registry: {
        mcps: [{ id: 'memory' }],
        errors: [],
        mcp_errors: [],
        enabled_mcp_servers: ['memory'],
      },
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'list-mcp-servers');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'refresh-mcp-servers');
    expect(mockInvoke).toHaveBeenNthCalledWith(3, 'set-mcp-server-enabled', {
      id: 'memory',
      enabled: true,
    });
  });
});
