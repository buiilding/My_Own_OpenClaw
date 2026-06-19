/**
 * Covers desktop extension runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let subscribedListener: ((event?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (event?: unknown) => void) => {
      subscribedListener = listener;
      return () => {
        subscribedListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    LIST_AGENT_EXTENSIONS: 'list-agent-extensions',
  },
  ON_CHANNELS: {
    AGENT_CAPABILITY_EVENT: 'agent-capability-event',
  },
}));

import {
  DesktopExtensionRuntimeClient,
  getAgentExtensionRuntimeErrorPresentation,
  getAgentLocalToolManifestPresentation,
  getAgentMcpRuntimeMetadataPresentation,
  getAgentPluginRuntimePresentation,
  getAgentLocalToolToggleConfigPatch,
  getAgentRemoteToolPresentation,
  getAgentRemoteToolToggleConfigPatch,
  getAgentSkillRuntimePresentation,
  isAgentLocalToolEnabled,
  isAgentRemoteToolEnabled,
  normalizeAgentCapabilityEvent,
  normalizeAgentExtensionRuntime,
  normalizeAgentRemoteToolCatalog,
  normalizeAgentToolManifestStatus,
  resolveAgentCapabilityUpdate,
} from '../../frontend/src/renderer/app/runtime/desktopExtensionRuntimeClient';

describe('DesktopExtensionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    subscribedListener = null;
  });

  test('normalizes extension runtime metadata at the runtime boundary', () => {
    expect(normalizeAgentExtensionRuntime({
      plugins: [{ id: 'notes' }],
      skills: [{ id: 'review' }],
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
    })).toEqual({
      plugins: [{ id: 'notes' }],
      skills: [{ id: 'review' }],
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
    });

    expect(normalizeAgentExtensionRuntime(null)).toEqual({
      plugins: [],
      skills: [],
      mcps: [],
      errors: [],
    });
  });

  test('normalizes capability event payloads into typed runtime fields', () => {
    expect(normalizeAgentToolManifestStatus({
      accepted: [{ name: 'read_file' }],
      rejected: 'bad',
    })).toEqual({
      accepted: [{ name: 'read_file' }],
      rejected: [],
    });
    expect(normalizeAgentRemoteToolCatalog({
      remote_tools: [{ name: 'web_search' }],
    })).toEqual({
      remote_tools: [{ name: 'web_search' }],
    });

    expect(normalizeAgentCapabilityEvent({
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
    })).toEqual({
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
      manifestStatus: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
    });

    expect(normalizeAgentCapabilityEvent({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
    })).toEqual({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
      remoteToolCatalog: {
        remote_tools: [{ name: 'web_search' }],
      },
    });
  });

  test('list and capability subscriptions return normalized payloads', async () => {
    mockInvoke.mockResolvedValueOnce({
      plugins: [{ id: 'notes' }],
      mcps: 'invalid',
    });
    const capabilityEvents: unknown[] = [];

    await expect(DesktopExtensionRuntimeClient.listAgentExtensions()).resolves.toEqual({
      plugins: [{ id: 'notes' }],
      skills: [],
      mcps: [],
      errors: [],
    });

    const unsubscribe = DesktopExtensionRuntimeClient.onAgentCapabilityEvent(event => {
      capabilityEvents.push(event);
    });
    subscribedListener?.({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
    });
    expect(capabilityEvents).toEqual([{
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
      remoteToolCatalog: {
        remote_tools: [{ name: 'web_search' }],
      },
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('list-agent-extensions');
  });

  test('capability update subscriptions emit manifest and catalog values directly', () => {
    expect(resolveAgentCapabilityUpdate({
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [],
      },
    })).toEqual({
      manifestStatus: {
        accepted: [{ name: 'read_file' }],
        rejected: [],
      },
      remoteToolCatalog: null,
    });

    const updates: unknown[] = [];
    const unsubscribe = DesktopExtensionRuntimeClient.onAgentCapabilityUpdate((
      manifestStatus,
      remoteToolCatalog,
    ) => {
      updates.push({ manifestStatus, remoteToolCatalog });
    });

    subscribedListener?.({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
    });

    expect(updates).toEqual([{
      manifestStatus: null,
      remoteToolCatalog: {
        remote_tools: [{ name: 'web_search' }],
      },
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
  });

  test('builds remote tool availability presentation from the runtime catalog', () => {
    const catalog = normalizeAgentRemoteToolCatalog({
      remote_tools: [
        {
          name: 'web_search',
          available: false,
          reason_unavailable: 'Missing API key',
        },
        {
          name: 'query_plan',
          available: true,
          reason_unavailable: 'ignored',
        },
      ],
    });

    expect(getAgentRemoteToolPresentation(catalog, 'web_search')).toEqual({
      name: 'web_search',
      available: false,
      unavailableReason: 'Missing API key',
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolPresentation(catalog, 'query_plan')).toEqual({
      name: 'query_plan',
      available: true,
      unavailableReason: '',
    });
    expect(getAgentRemoteToolPresentation(catalog, 'unknown_tool')).toEqual({
      name: 'unknown_tool',
      available: true,
      unavailableReason: '',
    });
  });

  test('builds extension runtime error presentation from raw error entries', () => {
    expect(getAgentExtensionRuntimeErrorPresentation({
      kind: 'plugin',
      id: 'broken-plugin',
      reason: 'manifest failed',
    })).toEqual({
      key: 'plugin-broken-plugin-manifest failed',
      text: 'plugin broken-plugin: manifest failed',
    });
    expect(DesktopExtensionRuntimeClient.getExtensionRuntimeErrorPresentation(null)).toEqual({
      key: 'extension-unknown-',
      text: 'extension unknown',
    });
  });

  test('builds local tool manifest presentation from accepted and rejected entries', () => {
    const manifestStatus = normalizeAgentToolManifestStatus({
      accepted: [{
        name: 'read_file',
        execution_target: 'local_runtime',
        argument_resolution: 'passthrough',
        schema: { type: 'object' },
      }],
      rejected: [{
        name: 'broken_tool',
        reason: 'bad schema',
      }, {
        name: 'missing_reason',
      }],
    });

    expect(getAgentLocalToolManifestPresentation(manifestStatus, 'read_file')).toEqual({
      acceptedTool: {
        name: 'read_file',
        execution_target: 'local_runtime',
        argument_resolution: 'passthrough',
        schema: { type: 'object' },
      },
      rejectedReason: '',
      status: 'accepted',
    });
    expect(DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(
      manifestStatus,
      'broken_tool',
    )).toEqual({
      acceptedTool: null,
      rejectedReason: 'bad schema',
      status: 'rejected',
    });
    expect(getAgentLocalToolManifestPresentation(manifestStatus, 'missing_reason')).toEqual({
      acceptedTool: null,
      rejectedReason: 'manifest validation failed',
      status: 'rejected',
    });
    expect(getAgentLocalToolManifestPresentation(manifestStatus, 'unknown_tool')).toEqual({
      acceptedTool: null,
      rejectedReason: '',
      status: 'pending',
    });
  });

  test('builds agent tool toggle state and config patches', () => {
    const config = {
      agent_disabled_local_tools: ['browser', 'extra-local'],
      agent_disabled_remote_tools: ['web_search'],
    };

    expect(isAgentLocalToolEnabled(config, 'browser')).toBe(false);
    expect(DesktopExtensionRuntimeClient.isLocalToolEnabled(config, 'read_file')).toBe(true);
    expect(isAgentRemoteToolEnabled(config, 'web_search')).toBe(false);
    expect(DesktopExtensionRuntimeClient.isRemoteToolEnabled(config, 'query_plan')).toBe(true);

    expect(getAgentLocalToolToggleConfigPatch(config, 'browser', true)).toEqual({
      agent_disabled_local_tools: ['extra-local'],
    });
    expect(DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(
      config,
      'read_file',
      false,
    )).toEqual({
      agent_disabled_local_tools: ['browser', 'extra-local', 'read_file'],
    });
    expect(getAgentRemoteToolToggleConfigPatch(config, 'web_search', true)).toEqual({
      agent_disabled_remote_tools: [],
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch(
      config,
      'query_plan',
      false,
    )).toEqual({
      agent_disabled_remote_tools: ['web_search', 'query_plan'],
    });
    expect(getAgentLocalToolToggleConfigPatch(null, 'browser', false)).toEqual({
      agent_disabled_local_tools: ['browser'],
    });
  });

  test('builds plugin runtime presentation from raw plugin metadata', () => {
    expect(getAgentPluginRuntimePresentation({
      id: 'notes',
      name: 'Notes',
      description: 'Adds note workflows.',
      version: '1.2.3',
      permissions: [{ id: 'filesystem', reason: 'Read local notes' }],
      settings_panels: [{
        id: 'extension:plugin:notes:settings:main',
        title: 'Notes settings',
        description: 'Configure note sync',
      }],
      tools: [{ name: 'save_note' }],
      config_schema: { type: 'object' },
    })).toEqual({
      debugSpec: {
        id: 'notes',
        version: '1.2.3',
        tools: ['save_note'],
        config_schema: { type: 'object' },
      },
      description: 'Adds note workflows.',
      displayName: 'Notes',
      key: 'plugin:notes',
      permissions: [{
        key: 'filesystem',
        text: 'filesystem: Read local notes',
      }],
      settingsPanelCount: 1,
      settingsPanels: [{
        key: 'extension:plugin:notes:settings:main',
        text: 'Notes settings: Configure note sync',
      }],
      toolCount: 1,
    });

    expect(DesktopExtensionRuntimeClient.getPluginRuntimePresentation(null)).toEqual({
      debugSpec: {
        id: 'unknown-plugin',
        version: null,
        tools: [],
        config_schema: {},
      },
      description: '',
      displayName: 'unknown-plugin',
      key: 'plugin:unknown-plugin',
      permissions: [],
      settingsPanelCount: 0,
      settingsPanels: [],
      toolCount: 0,
    });
  });

  test('builds extension skill and MCP metadata debug presentations', () => {
    expect(getAgentSkillRuntimePresentation([{
      id: 'extension:skill:review',
      type: 'extension_skill',
      priority: 75,
    }])).toEqual({
      count: 1,
      debugSpec: [{
        id: 'extension:skill:review',
        type: 'extension_skill',
        priority: 75,
      }],
      summary: '1 prompt layers',
    });

    expect(DesktopExtensionRuntimeClient.getMcpRuntimeMetadataPresentation([{
      id: 'memory',
      name: 'Memory',
      command: 'node',
      tools: [{ name: 'search' }],
    }])).toEqual({
      count: 1,
      debugSpec: [{
        id: 'memory',
        name: 'Memory',
        command: 'node',
        tools: ['search'],
      }],
      summary: '1 servers',
    });

    expect(getAgentMcpRuntimeMetadataPresentation(null)).toEqual({
      count: 0,
      debugSpec: [],
      summary: '0 servers',
    });
  });
});
