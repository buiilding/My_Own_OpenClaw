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
        optional: true,
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
          optional: true,
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
  });
});
