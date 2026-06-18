/**
 * Coordinates desktop agent extension metadata and capability events.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type AgentCapabilityEvent = {
  type?: string;
  payload?: Record<string, unknown>;
};

export type AgentCapabilityEventListener = (event?: AgentCapabilityEvent) => void;

export const DesktopAgentExtensionRuntimeClient = {
  listAgentExtensions(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.LIST_AGENT_EXTENSIONS);
  },

  onAgentCapabilityEvent(listener: AgentCapabilityEventListener): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.AGENT_CAPABILITY_EVENT, listener as (event?: unknown) => void);
  },
};
