/**
 * Runtime environment key groups for the Agent SDK.
 */

export type AgentRuntimeEnv = Record<string, string | undefined>;

export const AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS = Object.freeze({
  backendUrl: 'WINDIE_BACKEND_URL',
  installToken: 'WINDIE_API_KEY',
  localRuntimeDaemonScript: 'WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT',
  localRuntimePython: 'WINDIE_PYTHON',
  localRuntimeDaemonDiscoveryFile: 'WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE',
});

export const AGENT_BACKEND_URL_ENV_KEYS = Object.freeze([
  'AGENT_BACKEND_URL',
  AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.backendUrl,
]);

export const AGENT_INSTALL_TOKEN_ENV_KEYS = Object.freeze([
  'AGENT_INSTALL_TOKEN',
  AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.installToken,
]);

export const AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS = Object.freeze([
  'AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT',
  AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimeDaemonScript,
]);

export const AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS = Object.freeze([
  'AGENT_LOCAL_RUNTIME_PYTHON',
  AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimePython,
]);

export const AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS = Object.freeze([
  'AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE',
  AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimeDaemonDiscoveryFile,
]);

export const AGENT_BACKEND_URL_REQUIRED_MESSAGE = (
  'Agent SDK backend URL is required. Pass backendUrl, httpBaseUrl, or set '
  + 'AGENT_BACKEND_URL (legacy WINDIE_BACKEND_URL is also supported).'
);

export const AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE = (
  'Agent SDK client could not locate the local runtime daemon script. Set '
  + 'autoLocalRuntime.command, autoLocalRuntime.daemonScript, or '
  + 'AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT (legacy WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT is also supported).'
);

function readRuntimeEnvValue(env: AgentRuntimeEnv | undefined, key: string): string | undefined {
  const value = env?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readRuntimeEnv(env: AgentRuntimeEnv | undefined, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readRuntimeEnvValue(env, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function readGlobalRuntimeEnv(keys: readonly string[]): string | undefined {
  const processLike = (globalThis as unknown as {
    process?: {
      env?: AgentRuntimeEnv;
    };
  }).process;
  return readRuntimeEnv(processLike?.env, keys);
}
