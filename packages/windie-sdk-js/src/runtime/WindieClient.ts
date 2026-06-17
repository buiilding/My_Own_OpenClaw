/**
 * Provides compatibility exports for the historical Windie-prefixed agent client module.
 */

export * from './AgentClient.js';

export {
  AgentClient as WindieClient,
} from './AgentClient.js';

export type {
  AgentClientOptions as WindieClientOptions,
  AgentInstallAuthOptions as WindieInstallAuthOptions,
  AgentInstallAuthState as WindieInstallAuthState,
  AgentLocalRuntimeRequest as WindieLocalRuntimeRequest,
  AgentRuntimeFeatureOption as WindieRuntimeFeatureOption,
  AgentWakeUpOptions as WindieWakeUpOptions,
} from './AgentClient.js';
