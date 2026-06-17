/**
 * Provides compatibility exports for historical Windie-prefixed local runtime names.
 */

export * from './LocalSidecarRuntime.js';
export {
  createAgentLocalRuntimeProvider as createWindieLocalRuntimeProvider,
} from './LocalSidecarRuntime.js';
export type {
  AgentAutoSidecarOptions as WindieAutoSidecarOptions,
  AgentLocalRuntimeClient as WindieLocalRuntimeClient,
  AgentLocalRuntimeEvent as WindieLocalRuntimeEvent,
  AgentLocalRuntimeEventListener as WindieLocalRuntimeEventListener,
  AgentLocalRuntimeProvider as WindieLocalRuntimeProvider,
  AgentLocalRuntimeProviderContext as WindieLocalRuntimeProviderContext,
  AgentLocalToolExecutionPayload as WindieLocalToolExecutionPayload,
  AgentMcpDefinition as WindieMcpDefinition,
  AgentPluginDefinition as WindiePluginDefinition,
  AgentSkillDefinition as WindieSkillDefinition,
  AgentToolDefinition as WindieToolDefinition,
} from './LocalSidecarRuntime.js';
