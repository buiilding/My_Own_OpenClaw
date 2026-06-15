/**
 * Exposes the package entrypoint for the Electron main process.
 */

async function runScreenshotTask({ task }) {
  return task();
}

function createScreenshotWindowVisibilityRuntime() {
  return runScreenshotTask;
}

module.exports = {
  createScreenshotWindowVisibilityRuntime,
};
