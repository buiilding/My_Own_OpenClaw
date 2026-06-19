/**
 * Covers desktop dev UI runtime behavior in the frontend test suite.
 */

describe('desktopDevUiRuntime', () => {
  const originalWindow = global.window;

  afterEach(() => {
    jest.resetModules();
    global.window = originalWindow;
  });

  test('returns false outside a browser window', async () => {
    delete global.window;
    const { isDevUiEnabled } = await import(
      '../../frontend/src/renderer/app/runtime/desktopDevUiRuntime'
    );

    expect(isDevUiEnabled()).toBe(false);
  });

  test('reads dev_ui query flag once per module instance', async () => {
    global.window = {
      location: {
        search: '?dev_ui=1',
      },
    };
    const { isDevUiEnabled } = await import(
      '../../frontend/src/renderer/app/runtime/desktopDevUiRuntime'
    );

    expect(isDevUiEnabled()).toBe(true);
    global.window.location.search = '?dev_ui=0';
    expect(isDevUiEnabled()).toBe(true);
  });
});
