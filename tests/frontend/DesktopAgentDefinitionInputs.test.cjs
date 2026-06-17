/**
 * Covers Electron main agent definition input collection.
 */

const {
  buildDesktopAgentDefinitionInputs,
} = require('../../frontend/src/main/agent/desktop_agent_definition_inputs.cjs');

describe('desktop_agent_definition_inputs', () => {
  test('collects camelCase AGENTS.md layers for the SDK builder', () => {
    const agentsMd = [{ id: 'repo', type: 'agents_md', content: 'Repo rules.' }];

    expect(buildDesktopAgentDefinitionInputs({
      includeExtensionPromptLayers: false,
      agentsMd,
    })).toMatchObject({
      agentsMd,
    });
  });

  test('rejects removed snake_case AGENTS.md input aliases', () => {
    expect(() => buildDesktopAgentDefinitionInputs({
      includeExtensionPromptLayers: false,
      agents_md: [{ id: 'repo', type: 'agents_md', content: 'Repo rules.' }],
    })).toThrow('desktop agent definition inputs received removed input field(s): agents_md.');
  });
});
