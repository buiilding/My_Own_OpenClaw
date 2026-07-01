/**
 * Runs the output workflow for the developer CLI and automation tooling.
 */

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

module.exports = {
  printJson,
};
