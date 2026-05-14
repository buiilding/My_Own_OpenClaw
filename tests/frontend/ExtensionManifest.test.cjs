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
  fs.mkdirSync(path.join(extensionDir, 'python'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'skills', 'note-review'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'skills', 'manual-entry'), { recursive: true });
  fs.writeFileSync(
    path.join(extensionDir, 'tools', 'note.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(extensionDir, 'python', 'save_note.py'), 'def run(args):\n  return {}\n');
  fs.writeFileSync(path.join(extensionDir, 'guidance.md'), 'Prefer notes from this extension.');
  fs.writeFileSync(
    path.join(extensionDir, 'skills', 'note-review', 'SKILL.md'),
    [
      '---',
      'title: Note Review',
      'priority: 82',
      '---',
      '',
      'Review saved notes for follow-up actions.',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(extensionDir, 'skills', 'manual-entry', 'SKILL.md'),
    [
      '---',
      'title: Manual Skill',
      '---',
      '',
      'Use manual skill instructions.',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(extensionDir, 'extension.json'),
    JSON.stringify({
      id: 'notes',
      name: 'Notes',
      tools: [{
        name: 'save_note',
        description: 'Save a local note.',
        entrypoint: 'python/save_note.py:run',
        schema: 'tools/note.schema.json',
      }],
      prompt_layers: [{
        id: 'notes-guidance',
        type: 'extension',
        priority: 72,
        content_path: 'guidance.md',
      }],
      skills: [{
        path: 'skills/manual-entry',
        id: 'manual-note-skill',
        priority: 88,
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
        schema: expect.objectContaining({
          required: ['note'],
        }),
      }),
    ]);
    expect(tools[0]).not.toHaveProperty('optional');
    expect(tools[0]).not.toHaveProperty('execution_schema');
    expect(promptLayers).toEqual(
      expect.arrayContaining([
        {
          id: 'notes-guidance',
          type: 'extension',
          priority: 72,
          content: 'Prefer notes from this extension.',
        },
        {
          id: 'extension:notes:skill:manual-note-skill',
          type: 'extension_skill',
          priority: 88,
          content: '# Manual Skill\n\nUse manual skill instructions.',
        },
        {
          id: 'extension:notes:skill:note-review',
          type: 'extension_skill',
          priority: 82,
          content: '# Note Review\n\nReview saved notes for follow-up actions.',
        },
      ]),
    );
  });

  test('does not expose sidecar extension tools without an entrypoint', () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extension-loader-'));
    const extensionDir = path.join(extensionsDir, 'broken');
    fs.mkdirSync(path.join(extensionDir, 'tools'), { recursive: true });
    fs.writeFileSync(
      path.join(extensionDir, 'tools', 'tool.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
    );
    fs.writeFileSync(
      path.join(extensionDir, 'extension.json'),
      JSON.stringify({
        id: 'broken',
        tools: [{
          name: 'missing_entrypoint',
          description: 'Should not load.',
          schema: 'tools/tool.schema.json',
        }],
      }),
    );

    expect(loadExtensionTools({ extensionsDir })).toEqual([]);
  });
});
