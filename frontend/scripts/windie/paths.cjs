/**
 * Runs the paths workflow for the developer CLI and automation tooling.
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_DIR = REPO_ROOT;

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

module.exports = {
  FRONTEND_DIR,
  REPO_ROOT,
  repoPath,
};
