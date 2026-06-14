/**
 * Handles display query events for the Electron main process.
 */

function handleGetDisplays(deps = {}) {
  const { screen } = deps;
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  return displays.map((display, index) => ({
    id: display.id,
    label: `Display ${index + 1} (${display.size.width}x${display.size.height})`,
    isPrimary: display.id === primaryId,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
  }));
}

module.exports = {
  handleGetDisplays,
};
