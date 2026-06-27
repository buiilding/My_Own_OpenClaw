/** @jest-environment node */

const {
  summarizeCapabilityTrace,
} = require('../../scripts/windie/commands.cjs');

describe('windie capability trace summary', () => {
  test('summarizes runtime capability validation, policy, and final prompt counts', () => {
    const events = [
      {
        path: 'client_capability_manifest.validate',
        data: {
          capabilityRevision: 'cap_abc123',
          rawToolCount: 36,
          acceptedToolCount: 35,
          rejectedToolCount: 1,
          acceptedPromptLayerCount: 2,
          rejectedPromptLayerCount: 0,
          sourceCounts: {
            builtin: 0,
            client: 35,
            mcp: 35,
            plugin: 0,
            backend_remote: 0,
          },
        },
      },
      {
        path: 'client_capability_manifest.apply',
        data: {
          capabilityRevision: 'cap_abc123',
          effectiveAvailableToolCount: 49,
        },
      },
      {
        path: 'client_capability_manifest.policy',
        data: {
          capabilityRevision: 'cap_abc123',
          policyAllowedCount: 35,
          policyRejectedCount: 0,
        },
      },
      {
        path: 'backend.prompt',
        data: {
          capabilityRevision: 'cap_abc123',
          toolSchemaCount: 49,
          finalPromptLayerCount: 2,
          finalToolSourceCounts: {
            builtin: 14,
            client: 35,
            mcp: 35,
            plugin: 0,
            backend_remote: 0,
          },
        },
      },
    ];

    expect(summarizeCapabilityTrace(events)).toEqual({
      revision: 'cap_abc123',
      revisions: ['cap_abc123'],
      rawToolCount: 36,
      acceptedToolCount: 35,
      rejectedToolCount: 1,
      acceptedPromptLayerCount: 2,
      rejectedPromptLayerCount: 0,
      effectiveAvailableToolCount: 49,
      policyAllowedCount: 35,
      policyRejectedCount: 0,
      finalToolSchemaCount: 49,
      finalPromptLayerCount: 2,
      sourceCounts: {
        builtin: 14,
        client: 35,
        mcp: 35,
        plugin: 0,
        backend_remote: 0,
      },
      pathCounts: {
        'client_capability_manifest.validate': 1,
        'client_capability_manifest.apply': 1,
        'client_capability_manifest.policy': 1,
        'backend.prompt': 1,
      },
    });
  });
});
