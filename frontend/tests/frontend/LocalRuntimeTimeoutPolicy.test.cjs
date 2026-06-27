/** @jest-environment node */

const {
  DEFAULT_REQUEST_TIMEOUT_MS,
  resolveExecuteToolTimeoutMs,
} = require('../../src/main/sidecar/local_runtime_timeout_policy.cjs');

describe('local_runtime_timeout_policy', () => {
  test('uses the default request timeout for generic local-runtime requests', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(60000);
  });

  test('gives browser execution a longer timeout without changing other tools', () => {
    expect(resolveExecuteToolTimeoutMs('browser')).toBe(120000);
    expect(resolveExecuteToolTimeoutMs('screenshot')).toBe(60000);
    expect(resolveExecuteToolTimeoutMs('read_file')).toBe(60000);
  });
});
