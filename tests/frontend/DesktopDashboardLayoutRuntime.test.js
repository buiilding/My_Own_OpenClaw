/**
 * Covers renderer dashboard layout runtime helpers.
 */

import { requestDashboardLayoutPass } from '../../frontend/src/renderer/app/runtime/desktopDashboardLayoutRuntime';

describe('desktopDashboardLayoutRuntime', () => {
  test('requestDashboardLayoutPass dispatches resize over two animation frames', () => {
    const callbacks = [];
    const eventTarget = {
      dispatchEvent: jest.fn(),
      requestAnimationFrame: jest.fn((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    };

    expect(requestDashboardLayoutPass(eventTarget)).toBe(true);
    expect(eventTarget.dispatchEvent).not.toHaveBeenCalled();

    callbacks.shift()();
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(eventTarget.dispatchEvent.mock.calls[0][0].type).toBe('resize');
    expect(eventTarget.requestAnimationFrame).toHaveBeenCalledTimes(2);

    callbacks.shift()();
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(2);
  });

  test('requestDashboardLayoutPass falls back to a timeout resize pulse', () => {
    const eventTarget = {
      dispatchEvent: jest.fn(),
      setTimeout: jest.fn((callback) => {
        callback();
        return 1;
      }),
    };

    expect(requestDashboardLayoutPass(eventTarget)).toBe(true);
    expect(eventTarget.setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(eventTarget.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(eventTarget.dispatchEvent.mock.calls[0][0].type).toBe('resize');
  });

  test('requestDashboardLayoutPass no-ops without an event target', () => {
    expect(requestDashboardLayoutPass(null)).toBe(false);
  });
});
