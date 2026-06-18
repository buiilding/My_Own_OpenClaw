/**
 * Covers Electron main agent definition input collection.
 */

const {
  buildElectronAgentDefinitionInputs,
} = require('../../frontend/src/main/agent/electron_agent_definition_inputs.cjs');

describe('electron_agent_definition_inputs', () => {
  test('collects camelCase AGENTS.md layers for the SDK builder', () => {
    const agentsMd = [{ id: 'repo', type: 'agents_md', content: 'Repo rules.' }];

    expect(buildElectronAgentDefinitionInputs({
      includeExtensionPromptLayers: false,
      agentsMd,
    })).toMatchObject({
      agentsMd,
    });
  });

  test('rejects removed snake_case AGENTS.md input aliases', () => {
    expect(() => buildElectronAgentDefinitionInputs({
      includeExtensionPromptLayers: false,
      agents_md: [{ id: 'repo', type: 'agents_md', content: 'Repo rules.' }],
    })).toThrow('electron agent definition inputs received removed input field(s): agents_md.');
  });
});
