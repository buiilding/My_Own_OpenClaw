const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadAgentExtensions,
  loadExtensionPromptLayers,
  loadExtensionTools,
} = require('../../frontend/src/main/extension_manifest.cjs');

function writeExtension() {
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extension-loader-'));
  const extensionDir = path.join(extensionsDir, 'notes');
  fs.mkdirSync(path.join(extensionDir, 'tools'), { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'tools', 'note.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(extensionDir, 'guidance.md'), 'Prefer notes from this extension.');
  fs.writeFileSync(
    path.join(extensionDir, 'extension.json'),
    JSON.stringify({
      id: 'notes',
      name: 'Notes',
      tools: [{
        name: 'save_note',
        description: 'Save a local note.',
        model_schema: 'tools/note.schema.json',
        execution_schema: 'tools/note.schema.json',
      }],
      prompt_layers: [{
        id: 'notes-guidance',
        type: 'extension',
        priority: 72,
        content_path: 'guidance.md',
      }],
    }),
  );
  return extensionsDir;
}

describe('extension manifest loader', () => {
  test('loads tool schemas and prompt layers from extension.json', () => {
    const extensionsDir = writeExtension();

    const result = loadAgentExtensions({ extensionsDir });
    const tools = loadExtensionTools({ extensionsDir });
    const promptLayers = loadExtensionPromptLayers({ extensionsDir });

    expect(result.errors).toEqual([]);
    expect(result.extensions[0].id).toBe('notes');
    expect(tools).toEqual([
      expect.objectContaining({
        name: 'save_note',
        extension_id: 'notes',
        model_schema: expect.objectContaining({
          required: ['note'],
        }),
        execution_schema: expect.objectContaining({
          additionalProperties: false,
        }),
      }),
    ]);
    expect(promptLayers).toEqual([
      {
        id: 'notes-guidance',
        type: 'extension',
        priority: 72,
        content: 'Prefer notes from this extension.',
      },
    ]);
  });
});
