/**
 * Provides the overlay renderer registration module for the Electron main process.
 */

function registerOverlayRendererWindows(
  windows = [],
  deps = {},
) {
  const { registerRendererWindow } = deps;
  windows.forEach((win) => {
    if (win) {
      registerRendererWindow(win);
    }
  });
}

module.exports = {
  registerOverlayRendererWindows,
};
