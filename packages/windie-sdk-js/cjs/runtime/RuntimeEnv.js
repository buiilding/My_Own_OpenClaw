"use strict";
/**
 * Runtime environment key groups for the Agent SDK.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE = exports.AGENT_BACKEND_URL_REQUIRED_MESSAGE = exports.AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS = exports.AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS = exports.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS = exports.AGENT_INSTALL_TOKEN_ENV_KEYS = exports.AGENT_BACKEND_URL_ENV_KEYS = exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS = void 0;
exports.readRuntimeEnv = readRuntimeEnv;
exports.readGlobalRuntimeEnv = readGlobalRuntimeEnv;
exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS = Object.freeze({
    backendUrl: 'WINDIE_BACKEND_URL',
    installToken: 'WINDIE_API_KEY',
    localRuntimeDaemonScript: 'WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT',
    localRuntimePython: 'WINDIE_PYTHON',
    localRuntimeDaemonDiscoveryFile: 'WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE',
});
exports.AGENT_BACKEND_URL_ENV_KEYS = Object.freeze([
    'AGENT_BACKEND_URL',
    exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.backendUrl,
]);
exports.AGENT_INSTALL_TOKEN_ENV_KEYS = Object.freeze([
    'AGENT_INSTALL_TOKEN',
    exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.installToken,
]);
exports.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_ENV_KEYS = Object.freeze([
    'AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT',
    exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimeDaemonScript,
]);
exports.AGENT_LOCAL_RUNTIME_PYTHON_ENV_KEYS = Object.freeze([
    'AGENT_LOCAL_RUNTIME_PYTHON',
    exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimePython,
]);
exports.AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE_ENV_KEYS = Object.freeze([
    'AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE',
    exports.AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS.localRuntimeDaemonDiscoveryFile,
]);
exports.AGENT_BACKEND_URL_REQUIRED_MESSAGE = ('Agent SDK backend URL is required. Pass backendUrl, httpBaseUrl, or set '
    + 'AGENT_BACKEND_URL (legacy WINDIE_BACKEND_URL is also supported).');
exports.AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT_REQUIRED_MESSAGE = ('Agent SDK client could not locate the local runtime daemon script. Set '
    + 'autoLocalRuntime.command, autoLocalRuntime.daemonScript, or '
    + 'AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT (legacy WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT is also supported).');
function readRuntimeEnvValue(env, key) {
    const value = env?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function readRuntimeEnv(env, keys) {
    for (const key of keys) {
        const value = readRuntimeEnvValue(env, key);
        if (value) {
            return value;
        }
    }
    return undefined;
}
function readGlobalRuntimeEnv(keys) {
    const processLike = globalThis.process;
    return readRuntimeEnv(processLike?.env, keys);
}
