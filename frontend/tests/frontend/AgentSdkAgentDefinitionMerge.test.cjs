const {
  mergeQueryAgentDefinition,
} = require('../../packages/windie-sdk-js/cjs/transport/AgentSession.js');

describe('SDK agent definition query merge', () => {
  test('preserves the handshake client manifest for partial query definitions', () => {
    const merged = mergeQueryAgentDefinition(
      {
        tools: {
          mode: 'default_plus_client',
          client_manifest: {
            version: 1,
            tools: [
              {
                name: 'mouse_control',
                schema: { type: 'object', properties: {} },
              },
            ],
          },
        },
      },
      {
        system_prompt: {
          mode: 'replace',
          content: 'Use a concise voice.',
        },
        tools: {
          client_manifest: {
            version: 1,
            tools: [],
          },
        },
      },
    );

    expect(merged.tools.client_manifest.tools).toEqual([
      expect.objectContaining({ name: 'mouse_control' }),
    ]);
  });

  test('honors an empty replacement client manifest when query tool policy is explicit', () => {
    const merged = mergeQueryAgentDefinition(
      {
        tools: {
          mode: 'default_plus_client',
          client_manifest: {
            version: 1,
            tools: [
              {
                name: 'mouse_control',
                schema: { type: 'object', properties: {} },
              },
            ],
          },
        },
      },
      {
        tools: {
          mode: 'explicit',
          available_tools: ['web_search'],
          enabled_remote_tools: ['web_search'],
          disabled_tools: ['mouse_control'],
          client_manifest: {
            version: 1,
            tools: [],
          },
        },
      },
    );

    expect(merged.tools.client_manifest).toEqual({
      version: 1,
      tools: [],
    });
    expect(merged.tools.disabled_tools).toEqual(['mouse_control']);
    expect(merged.tools.available_tools).toEqual(['web_search']);
  });
});
