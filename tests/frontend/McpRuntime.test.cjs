/** @jest-environment node */

const { EventEmitter } = require('events');

const {
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  createMcpToolName,
  discoverMcpTools,
  executeMcpTool,
  hasDiscoveredMcpTool,
  normalizeMcpServerSpec,
} = require('../../frontend/src/main/extensions/mcp_runtime.cjs');

describe('MCP runtime', () => {
  afterEach(() => {
    clearMcpRuntimeCache();
  });

  function createClient() {
    return {
      listTools: jest.fn(async () => [
        {
          name: 'search',
          description: 'Search project memory.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false,
          },
        },
      ]),
      callTool: jest.fn(async (name, args) => ({
        content: [
          {
            type: 'text',
            text: `${name}:${args.query}`,
          },
        ],
      })),
    };
  }

  test('discovers MCP tools and projects them into client tool manifests', async () => {
    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
      }],
      createClient,
    });

    expect(manifest.tools).toEqual([
      expect.objectContaining({
        name: 'mcp_memory__search',
        description: '[MCP:memory] Search project memory.',
        execution_target: 'sidecar',
        argument_resolution: 'passthrough',
        mcp_server_id: 'memory',
        mcp_tool_name: 'search',
        schema: expect.objectContaining({
          required: ['query'],
        }),
      }),
    ]);
  });

  test('keeps explicit snake_case timeout precedence over camelCase fallback', () => {
    expect(normalizeMcpServerSpec({
      id: 'memory',
      command: 'node',
      timeout_ms: 0,
      timeoutMs: 9000,
    })).toEqual(expect.objectContaining({
      timeout_ms: 0,
    }));
  });

  test('executes discovered MCP tools through the local MCP client', async () => {
    const client = createClient();
    await discoverMcpTools({
      mcpServers: [{
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
      }],
      createClient: () => client,
    });

    const result = await executeMcpTool(
      createMcpToolName('memory', 'search'),
      { query: 'windie' },
      {},
      { createClient: () => client },
    );

    expect(client.callTool).toHaveBeenCalledWith('search', { query: 'windie' }, {});
    expect(result).toEqual({
      success: true,
      data: {
        output: 'search:windie',
        output: 'search:windie',
        mcp_result: {
          content: [{ type: 'text', text: 'search:windie' }],
        },
      },
    });
  });

  test('reconciles stale MCP tools after server removal', async () => {
    const client = createClient();
    const toolName = createMcpToolName('memory', 'search');
    await discoverMcpTools({
      mcpServers: [{
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
      }],
      createClient: () => client,
    });
    expect(hasDiscoveredMcpTool(toolName)).toBe(true);

    await discoverMcpTools({
      mcpServers: [],
      createClient: () => client,
    });

    expect(hasDiscoveredMcpTool(toolName)).toBe(false);
    await expect(
      executeMcpTool(toolName, { query: 'windie' }, {}, {
        mcpServers: [],
        createClient: () => client,
      }),
    ).resolves.toBeNull();
    expect(client.callTool).not.toHaveBeenCalled();
  });

  test('removes disabled MCP tools from the execution registry', async () => {
    const client = createClient();
    const toolName = createMcpToolName('memory', 'search');

    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      disabledTools: [toolName],
      mcpServers: [{
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
      }],
      createClient: () => client,
    });

    expect(manifest.tools).toEqual([]);
    expect(hasDiscoveredMcpTool(toolName)).toBe(false);
    await expect(
      executeMcpTool(toolName, { query: 'windie' }, {}, {
        mcpServers: [],
        createClient: () => client,
      }),
    ).resolves.toBeNull();
    expect(client.callTool).not.toHaveBeenCalled();
  });

  test('normalizes malformed base manifest metadata while appending MCP tools', async () => {
    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 'next', tools: { name: 'not-a-list' } },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        args: ['server.cjs'],
      }],
      createClient,
    });

    expect(manifest.version).toBe(1);
    expect(manifest.tools).toEqual([
      expect.objectContaining({
        name: 'mcp_memory__search',
        mcp_server_id: 'memory',
      }),
    ]);
  });

  test('falls back to declared MCP tool schemas when live discovery fails', async () => {
    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'declared',
        command: 'node',
        tools: [{
          name: 'known',
          description: 'Declared static MCP tool.',
          schema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        }],
      }],
      createClient: () => ({
        listTools: jest.fn(async () => {
          throw new Error('server offline');
        }),
      }),
    });

    expect(manifest.tools).toEqual([
      expect.objectContaining({
        name: 'mcp_declared__known',
        description: '[MCP:declared] Declared static MCP tool.',
      }),
    ]);
    expect(manifest.mcp_errors).toEqual([
      { server_id: 'declared', reason: 'server offline' },
    ]);
  });

  test('starts a fresh cached MCP client when server env values change', async () => {
    const spawnCalls = [];
    const spawnImpl = jest.fn((command, args, options) => {
      spawnCalls.push({ command, args, options });
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = {
        write: jest.fn((rawMessage) => {
          const message = JSON.parse(String(rawMessage).trim());
          if (message.method === 'initialize') {
            setImmediate(() => {
              proc.stdout.emit('data', `${JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: {},
                  serverInfo: { name: 'test' },
                },
              })}\n`);
            });
            return;
          }
          if (message.method === 'tools/list') {
            setImmediate(() => {
              proc.stdout.emit('data', `${JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  tools: [{
                    name: 'search',
                    description: 'Search',
                    inputSchema: { type: 'object', properties: {} },
                  }],
                },
              })}\n`);
            });
          }
        }),
      };
      proc.kill = jest.fn();
      return proc;
    });
    const server = {
      id: 'memory',
      command: 'node',
      args: ['server.cjs'],
      env: { TOKEN: 'old' },
    };

    await discoverMcpTools({ mcpServers: [server], spawnImpl });
    await discoverMcpTools({
      mcpServers: [{ ...server, env: { TOKEN: 'new' } }],
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(spawnCalls[0].options.env.TOKEN).toBe('old');
    expect(spawnCalls[1].options.env.TOKEN).toBe('new');
  });
});
