const {
  buildAgentCapabilityHandshakePayload,
} = require('../../frontend/src/main/agent_capability_handshake.cjs');
const {
  buildClientToolManifest,
} = require('../../frontend/src/main/tool_manifest.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

function makeExtensionDir() {
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extensions-'));
  const extensionDir = path.join(extensionsDir, 'demo-extension');
  fs.mkdirSync(path.join(extensionDir, 'tools'), { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'tools', 'demo.model.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(
    path.join(extensionDir, 'tools', 'demo.execution.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { value: { type: 'string' }, dry_run: { type: 'boolean' } },
      required: ['value'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(
    path.join(extensionDir, 'extension.json'),
    JSON.stringify({
      id: 'demo-extension',
      name: 'Demo Extension',
      tools: [{
        name: 'demo_tool',
        description: 'Demo extension tool.',
        model_schema: 'tools/demo.model.schema.json',
        execution_schema: 'tools/demo.execution.schema.json',
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
  });

  test('omits disabled local tools from manifest and available tools', () => {
    const payload = buildAgentCapabilityHandshakePayload({
      disabledTools: ['browser'],
    });

    expect(payload.available_tools).not.toContain('browser');
    expect(payload.client_tool_manifest.tools.map((tool) => tool.name)).not.toContain('browser');
  });

  test('loads extension tools into the manifest and handshake', () => {
    const extensionsDir = makeExtensionDir();

    const manifest = buildClientToolManifest({ extensionsDir });
    const payload = buildAgentCapabilityHandshakePayload({ extensionsDir });

    expect(manifest.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'demo_tool',
          description: 'Demo extension tool.',
          extension_id: 'demo-extension',
          model_schema: expect.objectContaining({
            required: ['value'],
          }),
          execution_schema: expect.objectContaining({
            properties: expect.objectContaining({
              dry_run: { type: 'boolean' },
            }),
          }),
        }),
      ]),
    );
    expect(payload.available_tools).toContain('demo_tool');
    expect(payload.client_tool_manifest.tools.map((tool) => tool.name)).toContain('demo_tool');
  });
});
