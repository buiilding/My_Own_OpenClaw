/**
 * Runs the output workflow for the developer CLI and automation tooling.
 */

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function statusLabel(ok) {
  return ok ? 'ok' : 'missing';
}

function printCheckList(title, checks) {
  console.log(title);
  for (const check of checks) {
    const state = check.ok ? 'OK' : 'WARN';
    const detail = check.detail ? ` - ${check.detail}` : '';
    console.log(`  ${state.padEnd(4)} ${check.name}${detail}`);
  }
}

function printSection(title, lines = []) {
  console.log(title);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

module.exports = {
  printCheckList,
  printJson,
  printSection,
  statusLabel,
};
