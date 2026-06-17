/**
 * Provides compatibility exports for the historical Windie-prefixed managed session module.
 */

export * from './ManagedAgentSession.js';

export {
  ManagedAgentSession as ManagedWindieAgentSession,
  createManagedAgentSession as createManagedWindieAgentSession,
} from './ManagedAgentSession.js';

export type {
  ManagedAgentBackendEndpoint as WindieManagedBackendEndpoint,
  ManagedAgentSessionOptions as ManagedWindieAgentSessionOptions,
} from './ManagedAgentSession.js';
