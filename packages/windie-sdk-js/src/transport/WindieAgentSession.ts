/**
 * Provides compatibility exports for the historical Windie-prefixed session transport module.
 */

export * from './AgentSession.js';

export {
  AgentSession as WindieAgentSession,
  createAgentBackendTransport as createWindieAgentBackendTransport,
  createAgentSession as createWindieAgentSession,
} from './AgentSession.js';

export type {
  AgentQueryInput as WindieAgentQueryInput,
  AgentSessionOptions as WindieAgentSessionOptions,
  AgentSessionRuntime as WindieAgentSessionRuntime,
  AgentStopInput as WindieAgentStopInput,
} from './AgentSession.js';
