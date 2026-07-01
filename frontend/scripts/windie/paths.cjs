/**
 * Runs the paths workflow for the developer CLI and automation tooling.
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

module.exports = {
  REPO_ROOT,
  repoPath,
};
