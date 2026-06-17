/**
 * Provides compatibility exports for historical Windie-prefixed hosted backend client names.
 */

export * from './HostedBackendHttpClient.js';
export {
  AgentHostedBackendClient as WindieSdkClient,
} from './HostedBackendHttpClient.js';
export type {
  AgentHostedBackendClient as WindieSdkClient,
  AgentHostedBackendClientOptions as WindieSdkClientOptions,
  AgentInstallIdentityResponse as WindieInstallIdentityResponse,
  AgentSdkQueryOptions as WindieSdkQueryOptions,
} from './HostedBackendHttpClient.js';
