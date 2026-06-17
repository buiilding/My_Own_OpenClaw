/**
 * Provides compatibility exports for historical Windie-prefixed agent stream event types.
 */

export * from './AgentStreamEvents.js';
export type {
  AgentStreamEvent as WindieAgentStreamEvent,
  AgentStreamState as WindieAgentStreamState,
  AgentToolCall as WindieAgentToolCall,
  AgentToolOutput as WindieAgentToolOutput,
} from './AgentStreamEvents.js';
