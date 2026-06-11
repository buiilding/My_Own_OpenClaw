const {
  buildAgentCapabilityHandshakePayload,
  buildAgentCapabilityHandshakePayloadWithMcp,
} = require('../../frontend/src/main/sdk/agent_capability_handshake.cjs');
const {
  buildClientToolManifest,
} = require('../../frontend/src/main/extensions/tool_manifest.cjs');
const {
  buildAgentDefinition,
} = require('../../frontend/src/main/sdk/agent_definition.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

function makeExtensionDir() {
  const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-contributions-'));
  const pluginDir = path.join(contributionRoot, 'plugins', 'demo-extension');
  const skillDir = path.join(contributionRoot, 'skills', 'demo-extension');
  fs.mkdirSync(path.join(pluginDir, 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'python'), { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'schemas', 'demo.model.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(pluginDir, 'python', 'demo_tool.py'), 'def run(args):\n  return {}\n');
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      id: 'demo-extension',
      name: 'Demo Extension',
      tools: [{
        name: 'demo_tool',
        description: 'Demo extension tool.',
        entrypoint: 'python/demo_tool.py:run',
        schema: 'schemas/demo.model.schema.json',
        argument_resolution: 'passthrough',
      }],
    }),
  );
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      'id: demo-extension-guidance',
      'priority: 70',
      '---',
      '',
      'Use the demo tool carefully.',
    ].join('\n'),
  );
  return contributionRoot;
}

describe('agent capability handshake manifest', () => {
  test('includes client tool manifest and preserves remote web_search availability', () => {
    const payload = buildAgentCapabilityHandshakePayload();
    const browserTool = payload.client_tool_manifest.tools.find((tool) => tool.name === 'browser');
    const shellTool = payload.client_tool_manifest.tools.find((tool) => tool.name === 'run_shell_command');

    expect(payload.available_tools).toContain('read_file');
    expect(payload.available_tools).toContain('web_search');
    expect(payload.client_tool_manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'read_file',
          execution_target: 'sidecar',
          argument_resolution: 'passthrough',
        }),
        expect.objectContaining({
          name: 'mouse_control',
          execution_target: 'sidecar',
          argument_resolution: 'backend_grounding',
        }),
      ]),
    );
    expect(browserTool).toEqual(expect.objectContaining({
      description: expect.stringContaining('navigation, extraction'),
      execution_target: 'sidecar',
      argument_resolution: 'passthrough',
    }));
    expect(browserTool.schema.required).toEqual(['action', 'explanation']);
    expect(browserTool.schema.properties.action.enum).toEqual(
      expect.arrayContaining(['navigate', 'snapshot', 'extract', 'click', 'read_long_content']),
    );
    expect(browserTool.schema.properties.url.description).toBe('URL to navigate to.');
    expect(shellTool.description).toContain('Execution Modes');
    expect(shellTool.schema.properties.command.description).toContain('prefer fast targeted commands');
    expect(payload.agent_definition).toEqual(
      expect.objectContaining({
        version: 1,
        system_prompt: { mode: 'default' },
        tools: expect.objectContaining({
          mode: 'explicit',
          client_manifest: payload.client_tool_manifest,
          enabled_remote_tools: ['web_search'],
        }),
      }),
    );
  });

  test('omits disabled local tools from manifest and available tools', () => {
    const payload = buildAgentCapabilityHandshakePayload({
      disabledTools: ['browser'],
    });

    expect(payload.available_tools).not.toContain('browser');
    expect(payload.client_tool_manifest.tools.map((tool) => tool.name)).not.toContain('browser');
    expect(payload.agent_definition.tools.disabled_tools).toContain('browser');
  });

  test('loads extension tools into the manifest and handshake', () => {
    const contributionRoot = makeExtensionDir();

    const manifest = buildClientToolManifest({
      contributionsDir: contributionRoot,
    });
    const payload = buildAgentCapabilityHandshakePayload({
      contributionsDir: contributionRoot,
    });

    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'demo_tool',
          description: 'Demo extension tool.',
          extension_id: 'plugin:demo-extension',
          plugin_id: 'demo-extension',
          schema: expect.objectContaining({
            required: ['value'],
          }),
        }),
      ]),
    );
    expect(payload.available_tools).toContain('demo_tool');
    expect(payload.client_tool_manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'demo_tool',
          schema: expect.objectContaining({
            required: ['value'],
          }),
        }),
      ]),
    );
    expect(payload.agent_definition.prompt_layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'extension:skill:demo-extension-guidance',
          type: 'extension_skill',
          content: 'Use the demo tool carefully.',
        }),
      ]),
    );
  });

  test('loads enabled MCP tools through the async handshake path', async () => {
    const payload = await buildAgentCapabilityHandshakePayloadWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        tool_prefix: 'memory',
        requires_user_enable: true,
        extension_id: 'mcp:memory',
      }],
      enabledMcpServers: ['mcp:memory'],
      createClient: () => ({
        listTools: jest.fn(async () => [{
          name: 'search',
          description: 'Search memory through MCP.',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
            additionalProperties: false,
          },
        }]),
      }),
    });

    expect(payload.available_tools).toContain('memory__search');
    expect(payload.client_tool_manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'memory__search',
          extension_id: 'mcp:memory',
          mcp_server_id: 'memory',
          mcp_tool_name: 'search',
        }),
      ]),
    );
    expect(payload.agent_definition.tools.client_manifest).toEqual(payload.client_tool_manifest);
  });

  test('omits user-gated MCP tools from async handshakes until enabled', async () => {
    const payload = await buildAgentCapabilityHandshakePayloadWithMcp({
      baseManifest: { version: 1, tools: [] },
      mcpServers: [{
        id: 'memory',
        command: 'node',
        tool_prefix: 'memory',
        requires_user_enable: true,
        extension_id: 'mcp:memory',
      }],
      enabledMcpServers: [],
      createClient: () => ({
        listTools: jest.fn(async () => [{
          name: 'search',
          inputSchema: { type: 'object', properties: {} },
        }]),
      }),
    });

    expect(payload.available_tools).not.toContain('memory__search');
    expect(payload.client_tool_manifest.tools.map((tool) => tool.name)).not.toContain('memory__search');
  });

  test('builds custom instructions and system prompt into agent definition', () => {
    const payload = buildAgentCapabilityHandshakePayload({
      systemPrompt: 'You are a custom Windie agent.',
      customInstructions: 'Prefer short answers.',
      availableTools: ['read_file'],
    });

    expect(payload.agent_definition.system_prompt).toEqual({
      mode: 'replace',
      content: 'You are a custom Windie agent.',
    });
    expect(payload.agent_definition.prompt_layers).toEqual(
      expect.arrayContaining([
        {
          id: 'custom-instructions',
          type: 'custom_instructions',
          priority: 60,
          content: 'Prefer short answers.',
        },
      ]),
    );
    expect(payload.available_coordinate_methods).toBeUndefined();
    expect(payload.agent_definition.runtime.coordinate_methods).toBeUndefined();
  });

  test('does not forward frontend coordinate-method requests', () => {
    const payload = buildAgentCapabilityHandshakePayload({
      requestedAgentPolicy: {
        coordinate_methods: ['ocr'],
        disabled_capabilities: ['vision'],
      },
    });

    expect(payload.available_coordinate_methods).toBeUndefined();
    expect(payload.requested_agent_policy.coordinate_methods).toBeUndefined();
    expect(payload.requested_agent_policy.disabled_capabilities).toEqual(['vision']);
    expect(payload.agent_definition.runtime.coordinate_methods).toBeUndefined();
  });

  test('can build partial query agent definitions without a tool manifest', () => {
    const definition = buildAgentDefinition({
      includeToolManifest: false,
      agentsMd: [{
        id: 'repo',
        type: 'agents_md',
        priority: 40,
        content: 'Follow repo rules.',
      }],
      workspacePath: '/tmp/project',
    });

    expect(definition.tools.client_manifest).toBeUndefined();
    expect(definition.agents_md).toEqual([
      {
        id: 'repo',
        type: 'agents_md',
        priority: 40,
        content: 'Follow repo rules.',
      },
    ]);
    expect(definition.runtime.workspace_path).toBe('/tmp/project');
  });

  test('defaults non-numeric prompt layer priority instead of coercing it to zero', () => {
    const definition = buildAgentDefinition({
      includeToolManifest: false,
      promptLayers: [{
        id: 'temporary-guidance',
        type: 'custom',
        priority: false,
        content: 'Use temporary guidance.',
      }],
    });

    expect(definition.prompt_layers).toEqual([
      {
        id: 'temporary-guidance',
        type: 'custom',
        priority: 100,
        content: 'Use temporary guidance.',
      },
    ]);
  });
});
