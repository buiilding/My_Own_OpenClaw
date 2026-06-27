/** @jest-environment node */

const { EventEmitter } = require('events');

const {
  buildClientToolManifestWithMcp,
  clearMcpRuntimeCache,
  configureMcpRuntime,
  createMcpToolName,
  resolveMcpEnvConfig,
} = require('../../src/main/extensions/mcp_runtime.cjs');

const sampleMcpConfig = Object.freeze({
  env: Object.freeze({
    enabledServers: 'SAMPLE_ENABLED_MCPS',
  }),
});

describe('MCP runtime', () => {
  afterEach(() => {
    configureMcpRuntime();
    clearMcpRuntimeCache();
    delete process.env.AGENT_ENABLED_MCPS;
    delete process.env.SAMPLE_ENABLED_MCPS;
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
        execution_target: 'local_runtime',
        argument_resolution: 'passthrough',
        mcp_server_id: 'memory',
        mcp_tool_name: 'search',
        schema: expect.objectContaining({
          required: ['query'],
        }),
      }),
    ]);
  });

  test('passes configured client info to MCP initialize requests', async () => {
    const rawMessages = [];
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = {
      write: jest.fn((rawMessage) => {
        rawMessages.push(String(rawMessage));
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
              result: { tools: [] },
            })}\n`);
          });
        }
      }),
    };
    proc.kill = jest.fn();

    await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'identity',
        command: 'node',
        args: ['server.cjs'],
      }],
      clientInfo: {
        name: 'Desktop Agent',
        version: '0.6.23',
      },
      spawnImpl: jest.fn(() => proc),
    });

    const initializeMessage = rawMessages
      .map((rawMessage) => JSON.parse(rawMessage.trim()))
      .find((message) => message.method === 'initialize');
    expect(initializeMessage.params.clientInfo).toEqual({
      name: 'Desktop Agent',
      version: '0.6.23',
    });
  });

  test('keeps user-gated MCP specs out of discovery unless explicitly enabled', async () => {
    const client = createClient();
    const toolName = createMcpToolName('memory', 'search');
    const gatedServer = {
      id: 'memory',
      command: 'node',
      args: ['server.cjs'],
      requires_user_enable: true,
      mcp_id: 'memory',
      extension_id: 'mcp:memory',
    };

    const disabledManifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [gatedServer],
      enabledMcpServers: [],
      createClient: () => client,
    });

    expect(disabledManifest.tools).toEqual([]);
    expect(client.listTools).not.toHaveBeenCalled();

    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [gatedServer],
      enabledMcpServers: ['mcp:memory'],
      createClient: () => client,
    });

    expect(client.listTools).toHaveBeenCalledTimes(1);
    expect(manifest.tools).toEqual([
      expect.objectContaining({
        name: toolName,
        mcp_server_id: 'memory',
      }),
    ]);
  });

  test('loads enabled MCP ids from comma-delimited options', () => {
    const client = createClient();
    return expect(buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      enabledMcpServers: 'mcp:memory, other',
      mcpServers: [{
        id: 'memory',
        command: 'node',
        requires_user_enable: true,
        extension_id: 'mcp:memory',
      }, {
        id: 'disabled',
        command: 'node',
        requires_user_enable: true,
        extension_id: 'mcp:disabled',
      }],
      createClient: () => client,
    })).resolves.toEqual(expect.objectContaining({
      tools: [
        expect.objectContaining({
          mcp_server_id: 'memory',
        }),
      ],
    }));
  });

  test('loads enabled MCP ids from generic env fallback', () => {
    const client = createClient();
    process.env.AGENT_ENABLED_MCPS = 'mcp:memory';

    return expect(buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        requires_user_enable: true,
        extension_id: 'mcp:memory',
      }],
      createClient: () => client,
    })).resolves.toEqual(expect.objectContaining({
      tools: [
        expect.objectContaining({
          mcp_server_id: 'memory',
        }),
      ],
    }));
  });

  test('loads enabled MCP ids from configured host env fallback', () => {
    const client = createClient();
    process.env.SAMPLE_ENABLED_MCPS = 'mcp:memory';
    configureMcpRuntime(sampleMcpConfig);

    return expect(buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        requires_user_enable: true,
        extension_id: 'mcp:memory',
      }],
      createClient: () => client,
    })).resolves.toEqual(expect.objectContaining({
      tools: [
        expect.objectContaining({
          mcp_server_id: 'memory',
        }),
      ],
    }));
  });

  test('MCP enablement env names are configurable by host config', () => {
    expect(resolveMcpEnvConfig()).toEqual({
      enabledServers: 'AGENT_ENABLED_MCPS',
    });
    expect(resolveMcpEnvConfig(sampleMcpConfig.env)).toEqual({
      enabledServers: 'SAMPLE_ENABLED_MCPS',
    });
  });

  test('removes disabled MCP tools from the projected manifest', async () => {
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
    expect(client.listTools).toHaveBeenCalledTimes(1);
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

  test('records MCP request timeout diagnostics with command args and stderr tail', async () => {
    const diagnosticEvents = [];
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = {
      write: jest.fn(() => {
        proc.stderr.emit('data', 'startup warning from server\n');
      }),
    };
    proc.kill = jest.fn();
    const spawnImpl = jest.fn(() => proc);

    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'slow',
        command: '/Users/peter/bin/slow-mcp',
        args: ['mcp'],
        timeout_ms: 5,
      }],
      spawnImpl,
      diagnostics: {
        emit: async (event) => {
          diagnosticEvents.push(event);
        },
      },
    });

    expect(manifest.tools).toEqual([]);
    expect(manifest.mcp_errors).toHaveLength(1);
    expect(manifest.mcp_errors[0].reason).toContain('MCP initialize timed out for slow');
    expect(manifest.mcp_errors[0].reason).toContain('command=slow-mcp');
    expect(manifest.mcp_errors[0].reason).toContain('args=["mcp"]');
    expect(manifest.mcp_errors[0].reason).toContain('startup warning from server');
    expect(diagnosticEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: 'request_timeout',
        status: 'failed',
        data: expect.objectContaining({
          serverId: 'slow',
          command: 'slow-mcp',
          args: '["mcp"]',
          phase: 'initialize',
          stderrTail: 'startup warning from server',
        }),
      }),
      expect.objectContaining({
        stage: 'server_discovery_failed',
        status: 'failed',
        data: expect.objectContaining({
          serverId: 'slow',
          phase: 'discovery',
        }),
      }),
    ]));
  });

  test('fails immediately when MCP spawn error arrives before request registration', async () => {
    const diagnosticEvents = [];
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = { write: jest.fn() };
    proc.kill = jest.fn();
    const spawnImpl = jest.fn(() => {
      process.nextTick(() => {
        const error = new Error('spawn missing-mcp ENOENT');
        error.code = 'ENOENT';
        proc.emit('error', error);
      });
      return proc;
    });

    const manifest = await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'missing',
        command: 'missing-mcp',
        args: ['mcp'],
        timeout_ms: 1000,
      }],
      spawnImpl,
      diagnostics: {
        emit: async (event) => {
          diagnosticEvents.push(event);
        },
      },
    });

    expect(manifest.tools).toEqual([]);
    expect(manifest.mcp_errors).toEqual([
      expect.objectContaining({
        server_id: 'missing',
        reason: expect.stringContaining('spawn missing-mcp ENOENT'),
      }),
    ]);
    expect(manifest.mcp_errors[0].reason).not.toContain('timed out');
    expect(diagnosticEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: 'process_error',
        status: 'failed',
        data: expect.objectContaining({
          serverId: 'missing',
          command: 'missing-mcp',
          args: '["mcp"]',
          phase: 'spawn',
        }),
      }),
      expect.objectContaining({
        stage: 'server_discovery_failed',
        status: 'failed',
      }),
    ]));
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

    await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [server],
      spawnImpl,
    });
    await buildClientToolManifestWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{ ...server, env: { TOKEN: 'new' } }],
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(spawnCalls[0].options.env.TOKEN).toBe('old');
    expect(spawnCalls[1].options.env.TOKEN).toBe('new');
  });
});
