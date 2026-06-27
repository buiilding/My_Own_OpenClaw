/**
 * Covers desktop extension runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let subscribedListener: ((event?: unknown) => void) | null = null;

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
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

import * as DesktopExtensionRuntimeModule from '../../src/renderer/app/runtime/desktopExtensionRuntimeClient';
import {
  DesktopExtensionRuntimeClient,
} from '../../src/renderer/app/runtime/desktopExtensionRuntimeClient';

describe('DesktopExtensionRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    subscribedListener = null;
  });

  test('keeps raw agent capability event helpers private to the runtime client', () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('normalizeAgentCapabilityEvent');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('resolveAgentCapabilityUpdate');
  });

  test('normalizes extension runtime metadata at the runtime boundary', async () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('normalizeAgentExtensionRuntime');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getEmptyAgentExtensionRuntime');
    expect(DesktopExtensionRuntimeClient.getEmptyExtensionRuntime()).toEqual({
      plugins: [],
      skills: [],
      mcps: [],
      errors: [],
    });
    mockInvoke
      .mockResolvedValueOnce({
        plugins: [{ id: 'notes' }],
        skills: [{ id: 'review' }],
        mcps: [{ id: 'memory' }],
        errors: [{ id: 'broken' }],
      })
      .mockResolvedValueOnce(null);

    await expect(DesktopExtensionRuntimeClient.listAgentExtensions()).resolves.toEqual({
      plugins: [{ id: 'notes' }],
      skills: [{ id: 'review' }],
      mcps: [{ id: 'memory' }],
      errors: [{ id: 'broken' }],
    });

    await expect(DesktopExtensionRuntimeClient.listAgentExtensions()).resolves.toEqual({
      plugins: [],
      skills: [],
      mcps: [],
      errors: [],
    });
  });

  test('normalizes capability payload helpers at the runtime boundary', () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('normalizeAgentToolManifestStatus');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('normalizeAgentRemoteToolCatalog');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getEmptyAgentToolManifestStatus');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getEmptyAgentRemoteToolCatalog');
    expect(DesktopExtensionRuntimeClient.getEmptyToolManifestStatus()).toEqual({
      accepted: [],
      rejected: [],
    });
    expect(DesktopExtensionRuntimeClient.getEmptyRemoteToolCatalog()).toEqual({
      remote_tools: [],
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
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
    });
    subscribedListener?.({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
    });
    expect(capabilityEvents).toEqual([{
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
      manifestStatus: {
        accepted: [{ name: 'read_file' }],
        rejected: [{ name: 'bad_tool' }],
      },
    }, {
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
    const updates: unknown[] = [];
    const unsubscribe = DesktopExtensionRuntimeClient.onAgentCapabilityUpdate((
      manifestStatus,
      remoteToolCatalog,
    ) => {
      updates.push({ manifestStatus, remoteToolCatalog });
    });

    subscribedListener?.({
      type: 'client-tool-manifest',
      payload: {
        accepted: [{ name: 'read_file' }],
        rejected: [],
      },
    });
    subscribedListener?.({
      type: 'remote-tool-catalog',
      payload: {
        remote_tools: [{ name: 'web_search' }],
      },
    });

    expect(updates).toEqual([{
      manifestStatus: {
        accepted: [{ name: 'read_file' }],
        rejected: [],
      },
      remoteToolCatalog: null,
    }, {
      manifestStatus: null,
      remoteToolCatalog: {
        remote_tools: [{ name: 'web_search' }],
      },
    }]);

    unsubscribe?.();
    expect(subscribedListener).toBeNull();
  });

  test('builds remote tool availability presentation from the runtime catalog', () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentRemoteToolPresentation');
    const catalog = {
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
    };

    expect(DesktopExtensionRuntimeClient.getRemoteToolPresentation(catalog, 'web_search')).toEqual({
      name: 'web_search',
      available: false,
      unavailableReason: 'Missing API key',
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolPresentation(catalog, 'query_plan')).toEqual({
      name: 'query_plan',
      available: true,
      unavailableReason: '',
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolPresentation(catalog, 'unknown_tool')).toEqual({
      name: 'unknown_tool',
      available: true,
      unavailableReason: '',
    });
  });

  test('builds extension runtime error presentation from raw error entries', () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentExtensionRuntimeErrorPresentation');
    expect(DesktopExtensionRuntimeClient.getExtensionRuntimeErrorPresentation({
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
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentLocalToolManifestPresentation');
    const manifestStatus = {
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
    };

    expect(DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(manifestStatus, 'read_file')).toEqual({
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
    expect(DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(manifestStatus, 'missing_reason')).toEqual({
      acceptedTool: null,
      rejectedReason: 'manifest validation failed',
      status: 'rejected',
    });
    expect(DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(manifestStatus, 'unknown_tool')).toEqual({
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

    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('isAgentLocalToolEnabled');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('isAgentRemoteToolEnabled');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentLocalToolToggleConfigPatch');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentRemoteToolToggleConfigPatch');
    expect(DesktopExtensionRuntimeClient.isLocalToolEnabled(config, 'browser')).toBe(false);
    expect(DesktopExtensionRuntimeClient.isLocalToolEnabled(config, 'read_file')).toBe(true);
    expect(DesktopExtensionRuntimeClient.isRemoteToolEnabled(config, 'web_search')).toBe(false);
    expect(DesktopExtensionRuntimeClient.isRemoteToolEnabled(config, 'query_plan')).toBe(true);

    expect(DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(config, 'browser', true)).toEqual({
      agent_disabled_local_tools: ['extra-local'],
    });
    expect(DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(
      config,
      'read_file',
      false,
    )).toEqual({
      agent_disabled_local_tools: ['browser', 'extra-local', 'read_file'],
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch(config, 'web_search', true)).toEqual({
      agent_disabled_remote_tools: [],
    });
    expect(DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch(
      config,
      'query_plan',
      false,
    )).toEqual({
      agent_disabled_remote_tools: ['web_search', 'query_plan'],
    });
    expect(DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(null, 'browser', false)).toEqual({
      agent_disabled_local_tools: ['browser'],
    });
  });

  test('builds plugin runtime presentation from raw plugin metadata', () => {
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentPluginRuntimePresentation');
    expect(DesktopExtensionRuntimeClient.getPluginRuntimePresentation({
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
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentSkillRuntimePresentation');
    expect(DesktopExtensionRuntimeModule).not.toHaveProperty('getAgentMcpRuntimeMetadataPresentation');
    expect(DesktopExtensionRuntimeClient.getSkillRuntimePresentation([{
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

    expect(DesktopExtensionRuntimeClient.getMcpRuntimeMetadataPresentation(null)).toEqual({
      count: 0,
      debugSpec: [],
      summary: '0 servers',
    });
  });
});
