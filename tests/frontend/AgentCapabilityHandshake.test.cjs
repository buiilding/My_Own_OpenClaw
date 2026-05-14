const {
  buildAgentCapabilityHandshakePayload,
} = require('../../frontend/src/main/agent_capability_handshake.cjs');
const {
  buildClientToolManifest,
} = require('../../frontend/src/main/tool_manifest.cjs');
const {
  buildAgentDefinition,
} = require('../../frontend/src/main/agent_definition.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

function makeExtensionDir() {
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extensions-'));
  const extensionDir = path.join(extensionsDir, 'demo-extension');
  fs.mkdirSync(path.join(extensionDir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'python'), { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'tools', 'demo.model.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(extensionDir, 'python', 'demo_tool.py'), 'def run(args):\n  return {}\n');
  fs.writeFileSync(
    path.join(extensionDir, 'extension.json'),
    JSON.stringify({
      id: 'demo-extension',
      name: 'Demo Extension',
      tools: [{
        name: 'demo_tool',
        description: 'Demo extension tool.',
        entrypoint: 'python/demo_tool.py:run',
        schema: 'tools/demo.model.schema.json',
        argument_resolution: 'passthrough',
      }],
      prompt_layers: [{
        id: 'demo-extension-guidance',
        type: 'extension',
        priority: 70,
        content: 'Use the demo tool carefully.',
      }],
    }),
  );
  return extensionsDir;
}

describe('agent capability handshake manifest', () => {
  test('includes client tool manifest and preserves remote web_search availability', () => {
    const payload = buildAgentCapabilityHandshakePayload();

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
    const extensionsDir = makeExtensionDir();

    const manifest = buildClientToolManifest({
      extensionsDir,
    });
    const payload = buildAgentCapabilityHandshakePayload({
      extensionsDir,
    });

    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'demo_tool',
          description: 'Demo extension tool.',
          extension_id: 'demo-extension',
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
          id: 'demo-extension-guidance',
          type: 'extension',
          content: 'Use the demo tool carefully.',
        }),
      ]),
    );
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
});
