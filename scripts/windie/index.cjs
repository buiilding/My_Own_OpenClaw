/**
 * Runs the index workflow for the developer CLI and automation tooling.
 */

const { dispatch } = require('./commands.cjs');

async function main(argv) {
  await dispatch(argv);
}

module.exports = {
  main,
};
