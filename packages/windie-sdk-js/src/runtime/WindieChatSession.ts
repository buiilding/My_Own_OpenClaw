/**
 * Provides compatibility exports for the historical Windie-prefixed chat session module.
 */

export * from './AgentChatSession.js';

export {
  AgentChatSession as WindieChatSession,
} from './AgentChatSession.js';

export type {
  AgentChatEditInput as WindieChatEditInput,
  AgentChatRetryInput as WindieChatRetryInput,
  AgentChatSendInput as WindieChatSendInput,
} from './AgentChatSession.js';
