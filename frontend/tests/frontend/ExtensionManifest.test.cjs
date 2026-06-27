/**
 * Covers extension manifest. behavior in the frontend test suite.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  clearExtensionRuntimeCache,
  configureExtensionManifestRuntime,
  loadAgentExtensionRegistry,
  loadExtensionMcpServers,
  loadExtensionPluginTools,
  loadExtensionSettingsPanels,
  loadExtensionSkillPromptLayers,
  loadPublicExtensionRegistry,
  resolveDefaultContributionRoot,
  resolveExtensionEnvConfig,
} = require('../../src/main/extensions/extension_manifest.cjs');

const sampleExtensionConfig = Object.freeze({
  env: Object.freeze({
    contributionsDir: 'SAMPLE_AGENT_CONTRIBUTIONS_DIR',
  }),
});

function writeExtensionRegistry() {
  const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contributions-'));
  const pluginDir = path.join(contributionRoot, 'plugins', 'notes');
  const skillDir = path.join(contributionRoot, 'skills', 'note-review');
  const mcpDir = path.join(contributionRoot, 'mcps', 'notes-memory');
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
      required_permissions: [{ id: 'filesystem', reason: 'Read and write local notes.' }],
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
      timeout_ms: 0,
      requires_user_enable: true,
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
  return contributionRoot;
}

describe('extension registry loader', () => {
  afterEach(() => {
    clearExtensionRuntimeCache();
    configureExtensionManifestRuntime();
    delete process.env.SAMPLE_AGENT_CONTRIBUTIONS_DIR;
    delete process.env.AGENT_CONTRIBUTIONS_DIR;
  });

  test('loads divided plugin, skill, and MCP roots', () => {
    const contributionRoot = writeExtensionRegistry();

    const result = loadAgentExtensionRegistry({ contributionsDir: contributionRoot });
    const tools = loadExtensionPluginTools({ contributionsDir: contributionRoot });
    const promptLayers = loadExtensionSkillPromptLayers({ contributionsDir: contributionRoot });
    const settingsPanels = loadExtensionSettingsPanels({ contributionsDir: contributionRoot });
    const mcpServers = loadExtensionMcpServers({ contributionsDir: contributionRoot });

    expect(result.errors).toEqual([]);
    expect(result.plugins[0].id).toBe('notes');
    expect(tools).toEqual([
      expect.objectContaining({
        name: 'save_note',
        plugin_id: 'notes',
        extension_id: 'plugin:notes',
        execution_target: 'local_runtime',
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
        requires_user_enable: true,
        timeout_ms: 0,
        tools: [expect.objectContaining({ name: 'search_notes' })],
      }),
    ]);
  });

  test('uses local-runtime entrypoint naming inside manifest validation', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/extensions/extension_manifest.cjs'),
      'utf8',
    );

    expect(source).toContain('hasLocalRuntimeEntrypoint');
    expect(source).not.toContain('hasSidecarEntrypoint');
    expect(source).toContain("execution_target: 'local_runtime'");
  });

  test('returns public registry metadata without executable handlers', () => {
    const contributionRoot = writeExtensionRegistry();
    const publicRuntime = loadPublicExtensionRegistry({ contributionsDir: contributionRoot });

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
      requires_user_enable: true,
      tools: [expect.objectContaining({ name: 'search_notes' })],
    }));
    expect(JSON.stringify(publicRuntime)).not.toContain('def run');
  });

  test('does not expose plugin tools without an entrypoint', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contributions-'));
    const pluginDir = path.join(contributionRoot, 'plugins', 'broken');
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

    expect(loadExtensionPluginTools({ contributionsDir: contributionRoot })).toEqual([]);
  });

  test('rejects removed extension manifest alias fields', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contributions-'));
    const pluginDir = path.join(contributionRoot, 'plugins', 'alias-plugin');
    const mcpDir = path.join(contributionRoot, 'mcps', 'alias-mcp');
    fs.mkdirSync(path.join(pluginDir, 'schemas'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, 'python'), { recursive: true });
    fs.mkdirSync(mcpDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'schemas', 'tool.schema.json'),
      JSON.stringify({ type: 'object', properties: {}, additionalProperties: false }),
    );
    fs.writeFileSync(path.join(pluginDir, 'python', 'tool.py'), 'def run(args):\n  return {}\n');
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'alias-plugin',
        permissions: [{ id: 'filesystem' }],
        configSchema: { type: 'object' },
        settings_panels: [{ id: 'panel', name: 'Alias Panel', schema: { type: 'object' } }],
        tools: [{
          name: 'alias_tool',
          entrypoint: 'python/tool.py:run',
          tool_schema: 'schemas/tool.schema.json',
        }],
      }),
    );
    fs.writeFileSync(
      path.join(mcpDir, 'mcp.json'),
      JSON.stringify({
        id: 'alias-mcp',
        command: 'node',
        timeoutMs: 1234,
        toolPrefix: 'alias_prefix',
        requiresUserEnable: true,
        tools: [{
          name: 'alias_search',
          inputSchema: { type: 'object', properties: {} },
        }],
      }),
    );

    const result = loadAgentExtensionRegistry({ contributionsDir: contributionRoot });

    expect(result.plugins).toEqual([]);
    expect(result.mcps).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        kind: 'plugin',
        id: 'alias-plugin',
        reason: 'Plugin manifest uses removed manifest field(s): permissions, configSchema',
      }),
      expect.objectContaining({
        kind: 'mcp',
        id: 'alias-mcp',
        reason: 'MCP server alias-mcp uses removed manifest field(s): timeoutMs, toolPrefix, requiresUserEnable',
      }),
    ]);
  });

  test('defaults blank skill priority instead of coercing it to zero', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-contributions-'));
    const skillDir = path.join(contributionRoot, 'skills', 'blank-priority');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'title: Blank Priority',
        'priority:',
        '---',
        '',
        'Use the blank priority skill.',
      ].join('\n'),
    );

    expect(loadExtensionSkillPromptLayers({ contributionsDir: contributionRoot })).toEqual([
      {
        id: 'extension:skill:blank-priority',
        type: 'extension_skill',
        priority: 75,
        content: '# Blank Priority\n\nUse the blank priority skill.',
      },
    ]);
  });

  test('default contribution root ignores ambient cwd contribution folders', () => {
    const previousCwd = process.cwd();
    const cwdContributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-cwd-contributions-'));
    fs.mkdirSync(path.join(cwdContributionRoot, 'plugins'), { recursive: true });
    process.chdir(cwdContributionRoot);

    try {
      expect(resolveDefaultContributionRoot()).toBe(path.resolve(__dirname, '../../'));
    } finally {
      process.chdir(previousCwd);
    }
  });

  test('default contribution root honors generic explicit environment override', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-env-contributions-'));
    process.env.AGENT_CONTRIBUTIONS_DIR = contributionRoot;

    expect(resolveDefaultContributionRoot()).toBe(path.resolve(contributionRoot));
  });

  test('default contribution root honors configured host environment override', () => {
    const contributionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-host-contributions-'));
    process.env.SAMPLE_AGENT_CONTRIBUTIONS_DIR = contributionRoot;
    configureExtensionManifestRuntime(sampleExtensionConfig);

    expect(resolveDefaultContributionRoot()).toBe(path.resolve(contributionRoot));
  });

  test('extension contribution env names are configurable by host config', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/main/extensions/extension_manifest.cjs'),
      'utf8',
    );
    const windieContributionEnv = ['WINDIE', 'AGENT', 'CONTRIBUTIONS', 'DIR'].join('_');

    expect(resolveExtensionEnvConfig()).toEqual({
      contributionsDir: 'AGENT_CONTRIBUTIONS_DIR',
    });
    expect(resolveExtensionEnvConfig(sampleExtensionConfig.env)).toEqual({
      contributionsDir: 'SAMPLE_AGENT_CONTRIBUTIONS_DIR',
    });
    expect(source).not.toContain(windieContributionEnv);
  });
});
