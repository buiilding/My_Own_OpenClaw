/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../frontend/src/main/extensions/extension_manifest.cjs', () => ({
  loadExtensionSkillPromptLayers: jest.fn(() => [
    { id: 'extension-layer', content: 'extension instructions' },
  ]),
}));

const {
  loadExtensionSkillPromptLayers,
} = require('../../frontend/src/main/extensions/extension_manifest.cjs');

const {
  createAgentDefinitionContextRuntime,
  mergeAgentDefinitionContext,
} = require('../../frontend/src/main/ipc/ipc_agent_definition_context.cjs');

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
    expect(mergeAgentDefinitionContext(
      createGeneratedDefinition(),
      {
        id: 'supplied-agent',
        runtime: { workspace_path: 'C:/other' },
        prompt_layers: [{ id: 'supplied-layer' }],
        agents_md: [{ path: 'nested/AGENTS.md' }],
        skills: [{ id: 'supplied-skill' }],
        plugins: [{ id: 'supplied-plugin' }],
      },
    )).toMatchObject({
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

  test('attaches generated repo, extension, custom instruction, workspace, and OS context', async () => {
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
      system_prompt: input.customInstructions
        ? { mode: 'replace', content: input.customInstructions }
        : { mode: 'default' },
    }));

    try {
      const runtime = createAgentDefinitionContextRuntime({
        getLatestDesktopUiConfig: () => ({
          agent_custom_instructions: ' Be concise. ',
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
        includeToolManifest: false,
        customInstructions: 'Be concise.',
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
      { agent_custom_instructions: ' Second instructions. ' },
    ];
    const buildAgentDefinition = jest.fn(input => ({
      mode: 'default_plus_overrides',
      system_prompt: input.customInstructions
        ? { mode: 'replace', content: input.customInstructions }
        : { mode: 'default' },
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
  });

  test('ipc.cjs composes agent definition context through the runtime wrapper', async () => {
    const mainSource = await fs.promises.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc.cjs'),
      'utf8',
    );
    const helperSource = await fs.promises.readFile(
      path.resolve(__dirname, '../../frontend/src/main/ipc/ipc_agent_definition_context.cjs'),
      'utf8',
    );

    expect(mainSource).toContain('createAgentDefinitionContextRuntime({');
    expect(mainSource).toContain('agentDefinitionContextRuntime.attach(payload)');
    expect(mainSource).not.toContain('attachAgentDefinitionContextRuntime(payload');
    expect(helperSource).toContain('function createAgentDefinitionContextRuntime');
    const helperModule = require('../../frontend/src/main/ipc/ipc_agent_definition_context.cjs');
    expect(helperModule.attachAgentDefinitionContext).toBeUndefined();
    expect(typeof helperModule.mergeAgentDefinitionContext).toBe('function');
  });
});
