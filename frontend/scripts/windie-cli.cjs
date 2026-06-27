#!/usr/bin/env node
/**
 * Runs the windie cli workflow for the developer CLI and automation tooling.
 */

const { main } = require('./windie/index.cjs');

main(process.argv.slice(2)).catch((error) => {
  console.error(`[windie] ${error?.message || String(error)}`);
  process.exit(1);
});
