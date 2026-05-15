const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadAgentExtensionRegistry,
  loadExtensionMcpServers,
  loadExtensionPluginTools,
  loadExtensionSettingsPanels,
  loadExtensionSkillPromptLayers,
  loadPublicExtensionRegistry,
} = require('../../frontend/src/main/extension_manifest.cjs');

function writeExtensionRegistry() {
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extension-registry-'));
  const pluginDir = path.join(extensionsDir, 'plugins', 'notes');
  const skillDir = path.join(extensionsDir, 'skills', 'note-review');
  const mcpDir = path.join(extensionsDir, 'mcps', 'notes-memory');
  fs.mkdirSync(path.join(pluginDir, 'schemas'), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, 'python'), { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(mcpDir, { recursive: true });

  fs.writeFileSync(
    path.join(pluginDir, 'schemas', 'note.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { note: { type: 'string' } },
      required: ['note'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(pluginDir, 'python', 'save_note.py'), 'def run(args):\n  return {}\n');
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      id: 'notes',
      name: 'Notes',
      permissions: [{ id: 'filesystem', reason: 'Read and write local notes.' }],
      settings_panels: [{
        id: 'notes',
        title: 'Notes',
        description: 'Configure note behavior.',
        config_schema: { type: 'object' },
      }],
      tools: [{
        name: 'save_note',
        description: 'Save a local note.',
        entrypoint: 'python/save_note.py:run',
        schema: 'schemas/note.schema.json',
      }],
    }),
  );
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
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
    path.join(mcpDir, 'mcp.json'),
    JSON.stringify({
      id: 'notes-memory',
      command: 'node',
      args: ['memory-server.cjs'],
      tools: [{
        name: 'search_notes',
        description: 'Search notes through MCP.',
        schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      }],
    }),
  );
  return extensionsDir;
}

describe('extension registry loader', () => {
  test('loads divided plugin, skill, and MCP roots', () => {
    const extensionsDir = writeExtensionRegistry();

    const result = loadAgentExtensionRegistry({ extensionsDir });
    const tools = loadExtensionPluginTools({ extensionsDir });
    const promptLayers = loadExtensionSkillPromptLayers({ extensionsDir });
    const settingsPanels = loadExtensionSettingsPanels({ extensionsDir });
    const mcpServers = loadExtensionMcpServers({ extensionsDir });

    expect(result.errors).toEqual([]);
    expect(result.plugins[0].id).toBe('notes');
    expect(tools).toEqual([
      expect.objectContaining({
        name: 'save_note',
        plugin_id: 'notes',
        extension_id: 'plugin:notes',
        execution_target: 'sidecar',
        schema: expect.objectContaining({
          required: ['note'],
        }),
      }),
    ]);
    expect(tools[0]).not.toHaveProperty('optional');
    expect(tools[0]).not.toHaveProperty('execution_schema');
    expect(promptLayers).toEqual([
      {
        id: 'extension:skill:note-review',
        type: 'extension_skill',
        priority: 82,
        content: '# Note Review\n\nReview saved notes for follow-up actions.',
      },
    ]);
    expect(settingsPanels).toEqual([
      expect.objectContaining({
        id: 'extension:plugin:notes:settings:notes',
        plugin_id: 'notes',
        title: 'Notes',
      }),
    ]);
    expect(mcpServers).toEqual([
      expect.objectContaining({
        id: 'notes-memory',
        extension_id: 'mcp:notes-memory',
        command: 'node',
        tools: [expect.objectContaining({ name: 'search_notes' })],
      }),
    ]);
  });

  test('returns public registry metadata without executable handlers', () => {
    const extensionsDir = writeExtensionRegistry();
    const publicRuntime = loadPublicExtensionRegistry({ extensionsDir });

    expect(publicRuntime.plugins[0]).toEqual(expect.objectContaining({
      id: 'notes',
      permissions: [expect.objectContaining({ id: 'filesystem' })],
      settings_panels: [expect.objectContaining({ id: 'extension:plugin:notes:settings:notes' })],
    }));
    expect(publicRuntime.skills[0]).toEqual(expect.objectContaining({
      id: 'extension:skill:note-review',
    }));
    expect(publicRuntime.mcps[0]).toEqual(expect.objectContaining({
      id: 'notes-memory',
      env_keys: [],
      tools: [expect.objectContaining({ name: 'search_notes' })],
    }));
    expect(JSON.stringify(publicRuntime)).not.toContain('def run');
  });

  test('does not expose plugin tools without an entrypoint', () => {
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extension-registry-'));
    const pluginDir = path.join(extensionsDir, 'plugins', 'broken');
    fs.mkdirSync(path.join(pluginDir, 'schemas'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'schemas', 'tool.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
    );
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'broken',
        tools: [{
          name: 'missing_entrypoint',
          description: 'Should not load.',
          schema: 'schemas/tool.schema.json',
        }],
      }),
    );

    expect(loadExtensionPluginTools({ extensionsDir })).toEqual([]);
  });
});
