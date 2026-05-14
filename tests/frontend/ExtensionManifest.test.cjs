const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  executeMainProcessExtensionTool,
  loadAgentExtensions,
  loadExtensionMcpServers,
  loadExtensionPromptLayers,
  loadExtensionSettingsPanels,
  loadExtensionTools,
  loadPublicAgentExtensions,
  runExtensionLifecycleHook,
} = require('../../frontend/src/main/extension_manifest.cjs');

function writeExtension() {
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windie-agent-extension-loader-'));
  const extensionDir = path.join(extensionsDir, 'notes');
  fs.mkdirSync(path.join(extensionDir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'python'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'plugin'), { recursive: true });
  fs.mkdirSync(path.join(extensionDir, 'mcp'), { recursive: true });
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
    path.join(extensionDir, 'plugin', 'index.cjs'),
    [
      'module.exports = function register(api) {',
      '  api.registerPermission({ id: "filesystem", reason: "Read and write local notes." });',
      '  api.registerSettingsPanel({ id: "notes", title: "Notes", description: "Configure note behavior.", config_schema: { type: "object" } });',
      '  api.registerMcpServer({ id: "runtime-memory", command: "node", args: ["mcp/runtime-memory-server.cjs"], tools: [{ name: "remember", schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } }] });',
      '  api.registerPromptLayer({ id: "notes-runtime-guidance", type: "extension", priority: 73, content: "Runtime plugin guidance." });',
      '  api.registerSkill({ id: "runtime-note-skill", title: "Runtime Skill", priority: 83, content: "Use runtime skill instructions." });',
      '  api.registerTool({',
      '    name: "summarize_note",',
      '    description: "Summarize a local note.",',
      '    schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false },',
      '    async execute(args) { return { llm_content: `summary:${args.note}`, return_display: "Summarized" }; },',
      '  });',
      '  api.beforeToolCall(({ toolName, args }) => toolName === "summarize_note" ? { args: { ...args, note: `${args.note}!` } } : null);',
      '  api.afterToolCall(({ toolName, result }) => toolName === "summarize_note" ? { result: { ...result, data: { ...result.data, hooked: true } } } : null);',
      '  api.onSessionStart(() => ({ started: true }));',
      '};',
    ].join('\n'),
  );
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
    path.join(extensionDir, 'mcp', 'servers.json'),
    JSON.stringify({
      servers: [{
        id: 'notes-memory',
        command: 'node',
        args: ['mcp/memory-server.cjs'],
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
      }],
    }),
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
    const settingsPanels = loadExtensionSettingsPanels({ extensionsDir });
    const mcpServers = loadExtensionMcpServers({ extensionsDir });

    expect(result.errors).toEqual([]);
    expect(result.extensions[0].id).toBe('notes');
    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'save_note',
        extension_id: 'notes',
        schema: expect.objectContaining({
          required: ['note'],
        }),
      }),
      expect.objectContaining({
        name: 'summarize_note',
        extension_id: 'notes',
        schema: expect.objectContaining({
          required: ['note'],
        }),
      }),
    ]));
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
          id: 'notes-runtime-guidance',
          type: 'extension',
          priority: 73,
          content: 'Runtime plugin guidance.',
        },
        {
          id: 'extension:notes:skill:runtime-note-skill',
          type: 'extension_skill',
          priority: 83,
          content: '# Runtime Skill\n\nUse runtime skill instructions.',
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
    expect(settingsPanels).toEqual([
      expect.objectContaining({
        id: 'extension:notes:settings:notes',
        extension_id: 'notes',
        title: 'Notes',
      }),
    ]);
    expect(mcpServers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'notes-memory',
        extension_id: 'notes',
        command: 'node',
        tools: [expect.objectContaining({ name: 'search_notes' })],
      }),
      expect.objectContaining({
        id: 'runtime-memory',
        extension_id: 'notes',
        command: 'node',
        tools: [expect.objectContaining({ name: 'remember' })],
      }),
    ]));
  });

  test('executes main-process plugin tools and lifecycle hooks', async () => {
    const extensionsDir = writeExtension();
    const before = await runExtensionLifecycleHook('beforeToolCall', {
      toolName: 'summarize_note',
      args: { note: 'hello' },
    }, { extensionsDir });
    const pluginResult = await executeMainProcessExtensionTool(
      'summarize_note',
      before[0].result.args,
      {},
      { extensionsDir },
    );
    const after = await runExtensionLifecycleHook('afterToolCall', {
      toolName: 'summarize_note',
      args: before[0].result.args,
      result: pluginResult,
    }, { extensionsDir });
    const sessionHooks = await runExtensionLifecycleHook('onSessionStart', {}, { extensionsDir });

    expect(pluginResult).toEqual({
      success: true,
      data: {
        llm_content: 'summary:hello!',
        return_display: 'Summarized',
      },
    });
    expect(after[0].result.result.data.hooked).toBe(true);
    expect(sessionHooks[0].result).toEqual({ started: true });
  });

  test('returns public extension runtime metadata without executable handlers', () => {
    const extensionsDir = writeExtension();
    const publicRuntime = loadPublicAgentExtensions({ extensionsDir });

    expect(publicRuntime.extensions[0]).toEqual(expect.objectContaining({
      id: 'notes',
      permissions: [expect.objectContaining({ id: 'filesystem' })],
      settings_panels: [expect.objectContaining({ id: 'extension:notes:settings:notes' })],
      mcp_servers: expect.arrayContaining([
        expect.objectContaining({
          id: 'notes-memory',
          env_keys: [],
          tools: [expect.objectContaining({ name: 'search_notes' })],
        }),
      ]),
      lifecycle_hooks: {
        onSessionStart: 1,
        beforeToolCall: 1,
        afterToolCall: 1,
      },
    }));
    expect(JSON.stringify(publicRuntime)).not.toContain('async execute');
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
