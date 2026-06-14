/**
 * Covers surface visibility runtime. behavior in the frontend test suite.
 */

import {
  restoreSurfaceAfterBackgroundCapture,
  shouldManageSurfaceVisibilityForBackgroundCapture,
  suppressSurfaceForBackgroundCapture,
} from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/platform/surfaceVisibility';
import { INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

function setUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

function installIpcInvokeMock(result: unknown = { success: true }): jest.Mock {
  const invoke = jest.fn(async () => result);
  window.ipc = {
    send: jest.fn(),
    invoke,
    on: jest.fn(() => jest.fn()),
    once: jest.fn(),
  };
  return invoke;
}

describe('surface visibility platform runtime', () => {
  afterEach(() => {
    delete window.ipc;
    jest.restoreAllMocks();
  });

  test.each([
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false],
    ['macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', false],
    ['Linux', 'Mozilla/5.0 (X11; Linux x86_64)', true],
    ['unknown', 'Mozilla/5.0 (X11; FreeBSD amd64)', false],
  ])('resolves %s surface visibility runtime from user agent', async (_label, userAgent, expectedManaged) => {
    setUserAgent(userAgent);
    const invoke = installIpcInvokeMock({
      success: true,
      hiddenSurface: 'chatbox',
      waitMs: 80,
      settleMs: 120,
    });

    expect(shouldManageSurfaceVisibilityForBackgroundCapture()).toBe(expectedManaged);

    const collapseResult = await suppressSurfaceForBackgroundCapture({ waitMs: 80 });

    if (expectedManaged) {
      expect(invoke).toHaveBeenCalledWith(
        INVOKE_CHANNELS.PREPARE_SURFACE_FOR_SCREENSHOT,
        {
          waitMs: 80,
          settleMs: 120,
          hideSurface: true,
        },
      );
      expect(collapseResult).toEqual({
        collapsed: true,
        hiddenSurface: 'chatbox',
        timing: {
          waitTime: 0.08,
          hideInvokeTime: 0,
          settleTime: 0.12,
        },
      });
    } else {
      expect(invoke).not.toHaveBeenCalled();
      expect(collapseResult).toEqual({
        collapsed: false,
        hiddenSurface: 'none',
        timing: {
          waitTime: 0,
          hideInvokeTime: 0,
          settleTime: 0,
        },
      });
    }
  });

  test('linux restore sends IPC payload and normalizes restore result', async () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    const invoke = installIpcInvokeMock({ success: true });
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(125);

    const restoreResult = await restoreSurfaceAfterBackgroundCapture('main-window');

    expect(invoke).toHaveBeenCalledWith(
      INVOKE_CHANNELS.RESTORE_SURFACE_AFTER_SCREENSHOT,
      { hiddenSurface: 'main-window' },
    );
    expect(restoreResult).toEqual({
      restored: true,
      restoredSurface: 'main-window',
      restoreInvokeTime: 0.025,
    });
  });
});
