#!/usr/bin/env node
/**
 * Runs the jest runner workflow for the frontend tooling.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const jestBin = require.resolve('jest/bin/jest');
const env = {
  ...process.env,
  NODE_OPTIONS: [
    process.env.NODE_OPTIONS,
    '--no-deprecation',
  ].filter(Boolean).join(' '),
};

const result = spawnSync(process.execPath, [
  jestBin,
  '--config',
  'jest.config.cjs',
  ...process.argv.slice(2),
], {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[jest-runner] Failed to start Jest: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
