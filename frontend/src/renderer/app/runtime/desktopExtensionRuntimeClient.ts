/**
 * Coordinates desktop extension metadata and capability events.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type AgentExtensionRuntimeSnapshot = {
  plugins: unknown[];
  skills: unknown[];
  mcps: unknown[];
  errors: unknown[];
};

export type AgentToolManifestStatus = {
  accepted: unknown[];
  rejected: unknown[];
};

export type AgentRemoteToolCatalog = {
  remote_tools: unknown[];
};

export type AgentCapabilityEvent = {
  type?: string;
  payload?: Record<string, unknown> | AgentToolManifestStatus | AgentRemoteToolCatalog;
  manifestStatus?: AgentToolManifestStatus;
  remoteToolCatalog?: AgentRemoteToolCatalog;
};

export type AgentCapabilityEventListener = (event?: AgentCapabilityEvent) => void;

export const EMPTY_AGENT_EXTENSION_RUNTIME: AgentExtensionRuntimeSnapshot = {
  plugins: [],
  skills: [],
  mcps: [],
  errors: [],
};

export const EMPTY_AGENT_TOOL_MANIFEST_STATUS: AgentToolManifestStatus = {
  accepted: [],
  rejected: [],
};

export const EMPTY_AGENT_REMOTE_TOOL_CATALOG: AgentRemoteToolCatalog = {
  remote_tools: [],
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeAgentExtensionRuntime(payload: unknown): AgentExtensionRuntimeSnapshot {
  const source = recordOrEmpty(payload);
  return {
    plugins: Array.isArray(source.plugins) ? source.plugins : EMPTY_AGENT_EXTENSION_RUNTIME.plugins,
    skills: Array.isArray(source.skills) ? source.skills : EMPTY_AGENT_EXTENSION_RUNTIME.skills,
    mcps: Array.isArray(source.mcps) ? source.mcps : EMPTY_AGENT_EXTENSION_RUNTIME.mcps,
    errors: Array.isArray(source.errors) ? source.errors : EMPTY_AGENT_EXTENSION_RUNTIME.errors,
  };
}

export function normalizeAgentToolManifestStatus(payload: unknown): AgentToolManifestStatus {
  const source = recordOrEmpty(payload);
  return {
    accepted: Array.isArray(source.accepted) ? source.accepted : EMPTY_AGENT_TOOL_MANIFEST_STATUS.accepted,
    rejected: Array.isArray(source.rejected) ? source.rejected : EMPTY_AGENT_TOOL_MANIFEST_STATUS.rejected,
  };
}

export function normalizeAgentRemoteToolCatalog(payload: unknown): AgentRemoteToolCatalog {
  const source = recordOrEmpty(payload);
  return {
    remote_tools: Array.isArray(source.remote_tools)
      ? source.remote_tools
      : EMPTY_AGENT_REMOTE_TOOL_CATALOG.remote_tools,
  };
}

export function normalizeAgentCapabilityEvent(event: unknown): AgentCapabilityEvent | undefined {
  const source = recordOrEmpty(event);
  const type = typeof source.type === 'string' ? source.type : undefined;
  const payload = recordOrEmpty(source.payload);
  if (type === 'client-tool-manifest') {
    const manifestStatus = normalizeAgentToolManifestStatus(payload);
    return {
      type,
      payload: manifestStatus,
      manifestStatus,
    };
  }
  if (type === 'remote-tool-catalog') {
    const remoteToolCatalog = normalizeAgentRemoteToolCatalog(payload);
    return {
      type,
      payload: remoteToolCatalog,
      remoteToolCatalog,
    };
  }
  return type ? { type, payload } : undefined;
}

export const DesktopExtensionRuntimeClient = {
  async listAgentExtensions(): Promise<AgentExtensionRuntimeSnapshot> {
    return normalizeAgentExtensionRuntime(
      await IpcBridge.invoke(INVOKE_CHANNELS.LIST_AGENT_EXTENSIONS),
    );
  },

  onAgentCapabilityEvent(listener: AgentCapabilityEventListener): (() => void) | undefined {
    return IpcBridge.on(
      ON_CHANNELS.AGENT_CAPABILITY_EVENT,
      (event?: unknown) => listener(normalizeAgentCapabilityEvent(event)),
    );
  },
};
