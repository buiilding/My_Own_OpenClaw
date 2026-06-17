/**
 * Provides compatibility exports for historical Windie-prefixed builtin tool selection names.
 */

export * from './builtins.js';
export {
  agentBuiltins as windieBuiltins,
} from './builtins.js';
export type {
  AgentBuiltinSelection as WindieBuiltinSelection,
  AgentBuiltinToolSelection as WindieBuiltinToolSelection,
  AgentBuiltinToolSet as WindieBuiltinToolSet,
} from './builtins.js';
