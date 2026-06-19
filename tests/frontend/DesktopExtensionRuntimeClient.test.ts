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
});
