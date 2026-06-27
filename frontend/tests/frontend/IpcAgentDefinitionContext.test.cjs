/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/main/extensions/extension_manifest.cjs', () => ({
  loadExtensionSkillPromptLayers: jest.fn(() => [
    { id: 'extension-layer', content: 'extension instructions' },
  ]),
  loadExtensionPluginTools: jest.fn(() => []),
}));

const {
  loadExtensionSkillPromptLayers,
} = require('../../src/main/extensions/extension_manifest.cjs');

const agentDefinitionContextModule = require('../../src/main/ipc/ipc_agent_definition_context.cjs');
const {
  createAgentDefinitionContextRuntime,
} = agentDefinitionContextModule;
const {
  buildAgentDefinition,
  isDefaultAgentDefinition,
} = require('../../packages/windie-sdk-js/cjs/runtime/AgentDefinition.js');

function createGeneratedDefinition(overrides = {}) {
  return {
    version: 1,
    mode: 'default_plus_overrides',
    system_prompt: { mode: 'default' },
    tools: { mode: 'client_only', client_manifest: { version: 1, tools: [] } },
    runtime: { operating_system: 'Windows', workspace_path: 'C:/repo' },
    prompt_layers: [{ id: 'generated-layer' }],
    agents_md: [{ path: 'AGENTS.md', content: 'repo instructions' }],
    skills: [{ id: 'generated-skill' }],
    plugins: [{ id: 'generated-plugin' }],
    ...overrides,
  };
}

describe('ipc_agent_definition_context', () => {
  beforeEach(() => {
    loadExtensionSkillPromptLayers.mockClear();
  });

  test('merges supplied agent definition arrays while preserving generated runtime defaults', () => {
    const runtime = createAgentDefinitionContextRuntime({
      buildAgentDefinition: jest.fn(() => createGeneratedDefinition()),
      isDefaultAgentDefinition: () => false,
    });

    expect(runtime.attach({
      text: 'hello',
      agent_definition: {
        id: 'supplied-agent',
        runtime: { workspace_path: 'C:/other' },
        prompt_layers: [{ id: 'supplied-layer' }],
        agents_md: [{ path: 'nested/AGENTS.md' }],
        skills: [{ id: 'supplied-skill' }],
        plugins: [{ id: 'supplied-plugin' }],
      },
    }).agent_definition).toMatchObject({
      id: 'supplied-agent',
      runtime: {
        operating_system: 'Windows',
        workspace_path: 'C:/other',
      },
      prompt_layers: [{ id: 'generated-layer' }, { id: 'supplied-layer' }],
      agents_md: [{ path: 'AGENTS.md' }, { path: 'nested/AGENTS.md' }],
      skills: [{ id: 'generated-skill' }, { id: 'supplied-skill' }],
      plugins: [{ id: 'generated-plugin' }, { id: 'supplied-plugin' }],
    });
  });

  test('returns payload unchanged when generated definition is default and no definition was supplied', () => {
    const payload = { text: 'hello' };
    const buildAgentDefinition = jest.fn(() => ({ mode: 'default' }));
    const runtime = createAgentDefinitionContextRuntime({
      buildAgentDefinition,
      isDefaultAgentDefinition: definition => definition.mode === 'default',
    });

    expect(runtime.attach(payload)).toBe(payload);
  });

  test('attaches generated repo, extension, system prompt, tool policy, workspace, and OS context', async () => {
    const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agent-definition-context-'));
    await fs.promises.writeFile(
      path.join(repoRoot, 'AGENTS.md'),
      '# Repo instructions\n\nUse the repo rules.',
      'utf8',
    );
    const buildAgentDefinition = jest.fn(input => ({
      version: 1,
      mode: 'default_plus_overrides',
      runtime: {
        operating_system: input.operatingSystem,
        workspace_path: input.workspacePath,
      },
      prompt_layers: input.promptLayers,
      agents_md: input.agentsMd,
      system_prompt: input.systemPrompt
        ? { mode: 'replace', content: input.systemPrompt }
        : { mode: 'default' },
      tools: {
        available_tools: input.availableTools,
        disabled_tools: input.disabledTools,
        enabled_remote_tools: input.enabledRemoteTools,
      },
    }));

    try {
      const runtime = createAgentDefinitionContextRuntime({
        getLatestDesktopUiConfig: () => ({
          agent_custom_instructions: ' Be concise. ',
          agent_disabled_local_tools: ['browser', 'read_file'],
          agent_disabled_remote_tools: ['web_search'],
        }),
        platformName: 'win32',
        buildAgentDefinition,
        isDefaultAgentDefinition: () => false,
      });
      const result = runtime.attach({
        text: 'hello',
        workspace_path: repoRoot,
        agent_definition: {
          runtime: { workspace_path: 'supplied-workspace' },
          prompt_layers: [{ id: 'supplied-layer' }],
        },
      });

      expect(buildAgentDefinition).toHaveBeenCalledWith(expect.objectContaining({
        includeToolManifest: true,
        clientToolManifest: expect.objectContaining({
          tools: expect.not.arrayContaining([
            expect.objectContaining({ name: 'browser' }),
            expect.objectContaining({ name: 'read_file' }),
          ]),
        }),
        systemPrompt: 'Be concise.',
        availableTools: [],
        disabledTools: ['browser', 'read_file', 'web_search'],
        enabledRemoteTools: [],
        workspacePath: repoRoot,
        operatingSystem: 'Windows',
      }));
      expect(loadExtensionSkillPromptLayers).toHaveBeenCalledTimes(1);
      expect(buildAgentDefinition.mock.calls[0][0].promptLayers).toEqual([
        { id: 'extension-layer', content: 'extension instructions' },
      ]);
      expect(result.agent_definition.runtime).toEqual({
        operating_system: 'Windows',
        workspace_path: 'supplied-workspace',
      });
      expect(result.agent_definition.prompt_layers).toEqual([
        { id: 'extension-layer', content: 'extension instructions' },
        { id: 'supplied-layer' },
      ]);
      expect(result.agent_definition.agents_md).toEqual([
        expect.objectContaining({
          type: 'agents_md',
          content: expect.stringContaining('Use the repo rules.'),
        }),
      ]);
      expect(result.agent_definition.system_prompt).toEqual({
        mode: 'replace',
        content: 'Be concise.',
      });
    } finally {
      await fs.promises.rm(repoRoot, { recursive: true, force: true });
    }
  });

  test('runtime attaches context using the latest injected desktop config', () => {
    const configs = [
      { agent_custom_instructions: ' First instructions. ' },
      {
        agent_custom_instructions: ' Second instructions. ',
        agent_disabled_local_tools: ['browser'],
      },
    ];
    const buildAgentDefinition = jest.fn(input => ({
      mode: 'default_plus_overrides',
      system_prompt: input.systemPrompt
        ? { mode: 'replace', content: input.systemPrompt }
        : { mode: 'default' },
      tools: {
        mode: 'explicit',
        available_tools: input.availableTools,
        disabled_tools: input.disabledTools,
        enabled_remote_tools: input.enabledRemoteTools,
      },
    }));
    const runtime = createAgentDefinitionContextRuntime({
      getLatestDesktopUiConfig: jest.fn(() => configs.shift()),
      platformName: 'linux',
      buildAgentDefinition,
      isDefaultAgentDefinition: () => false,
    });

    expect(runtime.attach({ text: 'first' }).agent_definition.system_prompt).toEqual({
      mode: 'replace',
      content: 'First instructions.',
    });
    expect(runtime.attach({ text: 'second' }).agent_definition.system_prompt).toEqual({
      mode: 'replace',
      content: 'Second instructions.',
    });
    expect(buildAgentDefinition.mock.calls[0][0]).toMatchObject({
      availableTools: ['web_search'],
      disabledTools: [],
      enabledRemoteTools: ['web_search'],
    });
    expect(buildAgentDefinition.mock.calls[1][0]).toMatchObject({
      availableTools: ['web_search'],
      disabledTools: ['browser'],
      enabledRemoteTools: ['web_search'],
    });
  });

  test('delegates disabled tool list canonicalization to the SDK builder', () => {
    const runtime = createAgentDefinitionContextRuntime({
      getLatestDesktopUiConfig: () => ({
        agent_disabled_local_tools: [' browser ', '', 'browser', null],
        agent_disabled_remote_tools: [' web_search ', ' ', 'web_search'],
      }),
      buildAgentDefinition,
      isDefaultAgentDefinition,
    });

    const result = runtime.attach({ text: 'hello' });

    expect(result.agent_definition).toMatchObject({
      mode: 'default_plus_overrides',
      tools: {
        mode: 'default_plus_client',
        client_manifest: expect.objectContaining({
          tools: expect.not.arrayContaining([
            expect.objectContaining({ name: 'browser' }),
          ]),
        }),
        enabled_remote_tools: [],
        disabled_tools: ['browser', 'web_search'],
      },
    });
    expect(result.agent_definition.tools).not.toHaveProperty('available_tools');
  });

  test('sends an empty replacement client manifest when every local tool is disabled', () => {
    const runtime = createAgentDefinitionContextRuntime({
      getLatestDesktopUiConfig: () => ({
        agent_disabled_local_tools: [
          'mouse_control',
          'keyboard_control',
          'screenshot',
          'scroll_control',
          'switch_window',
          'wait',
          'get_open_windows',
          'get_system_stats',
          'open_app',
          'run_shell_command',
          'process',
          'read_file',
          'replace',
          'browser',
        ],
      }),
      buildAgentDefinition,
      isDefaultAgentDefinition,
    });

    const result = runtime.attach({ text: 'hello' });

    expect(result.agent_definition.tools.client_manifest).toEqual({
      version: 1,
      tools: [],
    });
    expect(result.agent_definition.tools.disabled_tools).toEqual([
      'mouse_control',
      'keyboard_control',
      'screenshot',
      'scroll_control',
      'switch_window',
      'wait',
      'get_open_windows',
      'get_system_stats',
      'open_app',
      'run_shell_command',
      'process',
      'read_file',
      'replace',
      'browser',
    ]);
  });

  test('keeps current agent settings authoritative over supplied stale tools and prompt', () => {
    const runtime = createAgentDefinitionContextRuntime({
      getLatestDesktopUiConfig: () => ({
        agent_custom_instructions: 'Current Agent prompt.',
        agent_disabled_local_tools: [
          'mouse_control',
          'keyboard_control',
          'screenshot',
          'scroll_control',
          'switch_window',
          'wait',
          'get_open_windows',
          'get_system_stats',
          'open_app',
          'run_shell_command',
          'process',
          'read_file',
          'replace',
          'browser',
        ],
      }),
      buildAgentDefinition,
      isDefaultAgentDefinition,
    });

    const result = runtime.attach({
      text: 'edited resend',
      agent_definition: {
        system_prompt: { mode: 'replace', content: 'Stale prompt.' },
        tools: {
          mode: 'default_plus_client',
          client_manifest: {
            version: 1,
            tools: [
              { name: 'mouse_control', schema: { type: 'object', properties: {} } },
              { name: 'browser', schema: { type: 'object', properties: {} } },
            ],
          },
          disabled_tools: [],
        },
        prompt_layers: [{ id: 'supplied-layer' }],
      },
    });

    expect(result.agent_definition.system_prompt).toEqual({
      mode: 'replace',
      content: 'Current Agent prompt.',
    });
    expect(result.agent_definition.tools.client_manifest).toEqual({
      version: 1,
      tools: [],
    });
    expect(result.agent_definition.tools.disabled_tools).toEqual([
      'mouse_control',
      'keyboard_control',
      'screenshot',
      'scroll_control',
      'switch_window',
      'wait',
      'get_open_windows',
      'get_system_stats',
      'open_app',
      'run_shell_command',
      'process',
      'read_file',
      'replace',
      'browser',
    ]);
    expect(result.agent_definition.prompt_layers).toEqual([
      expect.objectContaining({ id: 'extension-layer', content: 'extension instructions' }),
      { id: 'supplied-layer' },
    ]);
  });

  test('ipc.cjs composes agent definition context through the runtime wrapper', async () => {
    const mainSource = await fs.promises.readFile(
      path.resolve(__dirname, '../../src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.promises.readFile(
      path.resolve(__dirname, '../../src/main/ipc/ipc_agent_definition_context.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentDefinitionContextRuntime({');
    expect(mainSource).toContain('getLatestDesktopUiConfig: () => desktopUiConfigStore.getDesktopUiConfigForAgentDefinition()');
    expect(mainSource).toContain('agentDefinitionContextRuntime.attach(payload)');
    expect(mainSource).toContain('function attachRuntimeTurnContextToPayload(payload)');
    expect(mainSource).toContain('attachAgentDefinitionContextToPayload: attachRuntimeTurnContextToPayload');
    expect(mainSource).toContain('attachRuntimeTurnContextToPayload,');
    expect(mainSource).not.toContain('attachAgentDefinitionContextRuntime(payload');
    expect(helperSource).toContain('function createAgentDefinitionContextRuntime');
    expect(helperSource).not.toContain('function normalizeStringList');
    expect(agentDefinitionContextModule.attachAgentDefinitionContext).toBeUndefined();
    expect(agentDefinitionContextModule.mergeAgentDefinitionContext).toBeUndefined();
  });
});
