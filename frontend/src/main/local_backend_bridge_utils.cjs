const SUPPRESSED_STDERR_PATTERNS = [
  '[DEP0169] DeprecationWarning: `url.parse()`',
  'Use `node --trace-deprecation ...` to show where the warning was created',
];

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toErrorResponse(error) {
  return {
    success: false,
    error: getErrorMessage(error),
  };
}

function withLocalBackendNodeOptions(baseEnv) {
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

module.exports = {
  getErrorMessage,
  shouldSuppressStderrLine,
  toErrorResponse,
  withLocalBackendNodeOptions,
};
