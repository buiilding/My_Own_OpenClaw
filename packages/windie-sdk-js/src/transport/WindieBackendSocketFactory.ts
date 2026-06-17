/**
 * Provides compatibility exports for historical Windie-prefixed backend socket names.
 */

export * from './BackendSocketFactory.js';
export {
  createAgentBackendSocket as createWindieSdkBackendSocket,
} from './BackendSocketFactory.js';
export type {
  AgentBackendSocketOptions as WindieSdkBackendSocketOptions,
} from './BackendSocketFactory.js';
