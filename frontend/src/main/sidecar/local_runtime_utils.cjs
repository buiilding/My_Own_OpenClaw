/**
 * Provides local runtime bridge utilities for the Electron main process.
 */

const DEFAULT_LOCAL_RUNTIME_ENV = Object.freeze({
  verboseStderr: 'AGENT_VERBOSE_LOCAL_RUNTIME_STDERR',
});
const PYTHON_LOG_LEVEL_PATTERN = /\s-\s(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s-\s/;
const FORWARD_LOG_LEVELS = new Set(['WARNING', 'ERROR', 'CRITICAL']);

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function withLocalRuntimeNodeOptions(baseEnv) {
  const env = { ...baseEnv };
  const nodeOptions = (env.NODE_OPTIONS || '').trim();

  if (nodeOptions.includes('--no-deprecation')) {
    return env;
  }

  env.NODE_OPTIONS = nodeOptions
    ? `${nodeOptions} --no-deprecation`
    : '--no-deprecation';
  return env;
}

function isTruthyEnvFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeEnvKey(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function resolveLocalRuntimeEnvConfig(localRuntimeEnv = {}) {
  return {
    verboseStderr: normalizeEnvKey(
      localRuntimeEnv.verboseStderr,
      DEFAULT_LOCAL_RUNTIME_ENV.verboseStderr,
    ),
  };
}

function parsePythonLogLevel(line) {
  const match = line.match(PYTHON_LOG_LEVEL_PATTERN);
  return match ? match[1] : null;
}

function shouldForwardStderrLine(line, env = process.env, localRuntimeEnv = {}) {
  const envConfig = resolveLocalRuntimeEnvConfig(localRuntimeEnv);
  if (isTruthyEnvFlag(env?.[envConfig.verboseStderr])) {
    return true;
  }

  const parsedLevel = parsePythonLogLevel(line);
  if (parsedLevel) {
    return FORWARD_LOG_LEVELS.has(parsedLevel);
  }

  const normalized = line.toLowerCase();
  return (
    normalized.includes('warning')
    || normalized.includes('error')
    || normalized.includes('exception')
    || normalized.includes('traceback')
    || normalized.includes('fatal')
  );
}

module.exports = {
  getErrorMessage,
  resolveLocalRuntimeEnvConfig,
  shouldForwardStderrLine,
  withLocalRuntimeNodeOptions,
};
