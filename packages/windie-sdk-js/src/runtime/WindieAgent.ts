/**
 * Provides compatibility exports for the historical Windie-prefixed agent runtime module.
 */

export * from './Agent.js';
export { Agent as WindieAgent } from './Agent.js';
export type {
  AgentClearConversationsOptions as WindieClearConversationsOptions,
  AgentClearMemoriesResult as WindieClearMemoriesResult,
  AgentDeleteMemoryResult as WindieDeleteMemoryResult,
  AgentMemoryListResult as WindieMemoryListResult,
  AgentMemoryQuery as WindieMemoryQuery,
  AgentMemoryType as WindieMemoryType,
  AgentOwner as WindieAgentOwner,
  AgentPrepareEditAndResendOptions as WindiePrepareEditAndResendOptions,
  AgentPrepareRetryTurnOptions as WindiePrepareRetryTurnOptions,
  AgentQueryOptions as WindieAgentQueryOptions,
  AgentRegisterMcpOptions as WindieAgentRegisterMcpOptions,
  AgentStopOptions as WindieAgentStopOptions,
  AgentStoreMemoryInput as WindieStoreMemoryInput,
  AgentStoreMemoryResult as WindieStoreMemoryResult,
  AgentTraceOptions as WindieAgentTraceOptions,
} from './Agent.js';
