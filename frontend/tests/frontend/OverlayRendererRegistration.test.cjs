/** @jest-environment node */

const {
  registerOverlayRendererWindows,
} = require('../../src/main/surfaces/overlay_renderer_registration.cjs');

describe('overlay_renderer_registration', () => {
  test('registers each provided window in order', () => {
    const registerRendererWindow = jest.fn();
    const windows = [{ id: 'chat' }, { id: 'response' }, { id: 'label' }];

    registerOverlayRendererWindows(windows, { registerRendererWindow });

    expect(registerRendererWindow).toHaveBeenCalledTimes(3);
    expect(registerRendererWindow).toHaveBeenNthCalledWith(1, windows[0]);
    expect(registerRendererWindow).toHaveBeenNthCalledWith(2, windows[1]);
    expect(registerRendererWindow).toHaveBeenNthCalledWith(3, windows[2]);
  });

  test('skips null/undefined windows', () => {
    const registerRendererWindow = jest.fn();
    const live = { id: 'chat' };

    registerOverlayRendererWindows([null, live, undefined], { registerRendererWindow });

    expect(registerRendererWindow).toHaveBeenCalledTimes(1);
    expect(registerRendererWindow).toHaveBeenCalledWith(live);
  });
});
