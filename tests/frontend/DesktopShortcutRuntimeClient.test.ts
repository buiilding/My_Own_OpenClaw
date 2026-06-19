/**
 * Covers desktop shortcut runtime client behavior in the frontend test suite.
 */

import {
  DesktopShortcutRuntimeClient,
  getGlobalAgentStopShortcutStatusPresentation,
} from '../../frontend/src/renderer/app/runtime/desktopShortcutRuntimeClient';

describe('DesktopShortcutRuntimeClient', () => {
  const originalNavigatorPlatform = window.navigator.platform;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalNavigatorPlatform,
    });
  });

  test('builds global stop shortcut status presentation values', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Linux x86_64',
    });

    const status = {
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: true,
      registrationFailed: true,
    };

    const presentation = getGlobalAgentStopShortcutStatusPresentation(status);

    expect(presentation).toEqual({
      showFallbackNotice: true,
      fallbackLabel: 'Ctrl + Shift + .',
      showRegistrationFailure: true,
    });
    expect(
      DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation(status),
    ).toEqual(presentation);
  });

  test('keeps fallback notice hidden when the runtime status is incomplete', () => {
    expect(getGlobalAgentStopShortcutStatusPresentation(null)).toEqual({
      showFallbackNotice: false,
      fallbackLabel: '',
      showRegistrationFailure: false,
    });
    expect(getGlobalAgentStopShortcutStatusPresentation({
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Alt+.',
      usingFallback: true,
      registrationFailed: false,
    })).toEqual({
      showFallbackNotice: false,
      fallbackLabel: '',
      showRegistrationFailure: false,
    });
  });
});
