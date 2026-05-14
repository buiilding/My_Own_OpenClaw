/** @jest-environment node */

const {
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  createMcpToolName,
  discoverMcpTools,
  executeMcpTool,
} = require('../../frontend/src/main/mcp_runtime.cjs');

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
        llm_content: 'search:windie',
        return_display: 'search:windie',
        mcp_result: {
          content: [{ type: 'text', text: 'search:windie' }],
        },
      },
    });
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
});
