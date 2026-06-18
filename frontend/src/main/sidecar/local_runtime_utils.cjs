/**
 * Provides local runtime bridge utilities for the Electron main process.
 */

const SUPPRESSED_STDERR_PATTERNS = [
  '[DEP0169] DeprecationWarning: `url.parse()`',
  'Use `node --trace-deprecation ...` to show where the warning was created',
];
const ENV_VERBOSE_LOCAL_RUNTIME_STDERR = 'WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR';
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

function shouldSuppressStderrLine(line) {
  return SUPPRESSED_STDERR_PATTERNS.some((pattern) => line.includes(pattern));
}

function isTruthyEnvFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePythonLogLevel(line) {
  const match = line.match(PYTHON_LOG_LEVEL_PATTERN);
  return match ? match[1] : null;
}

function shouldForwardStderrLine(line, env = process.env) {
  if (shouldSuppressStderrLine(line)) {
    return false;
  }
  if (isTruthyEnvFlag(env?.[ENV_VERBOSE_LOCAL_RUNTIME_STDERR])) {
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
  shouldForwardStderrLine,
  withLocalRuntimeNodeOptions,
};
