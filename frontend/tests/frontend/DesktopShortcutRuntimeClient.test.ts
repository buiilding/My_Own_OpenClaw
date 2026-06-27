/**
 * Covers desktop shortcut runtime client behavior in the frontend test suite.
 */

import {
  DesktopShortcutRuntimeClient,
} from '../../src/renderer/app/runtime/desktopShortcutRuntimeClient';
import * as DesktopShortcutRuntimeModule from '../../src/renderer/app/runtime/desktopShortcutRuntimeClient';

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

    expect(DesktopShortcutRuntimeModule).not.toHaveProperty('getGlobalAgentStopShortcutStatusPresentation');
    const presentation = DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation(status);

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
    expect(DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation(null)).toEqual({
      showFallbackNotice: false,
      fallbackLabel: '',
      showRegistrationFailure: false,
    });
    expect(DesktopShortcutRuntimeClient.getGlobalAgentStopShortcutStatusPresentation({
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

  test('resolves persistable global stop shortcut fallback accelerators', () => {
    expect(DesktopShortcutRuntimeModule).not.toHaveProperty('resolveGlobalAgentStopShortcutFallbackAccelerator');
    expect(DesktopShortcutRuntimeClient.resolveGlobalAgentStopShortcutFallbackAccelerator({
      resolvedAccelerator: ' CommandOrControl+Shift+. ',
      usingFallback: true,
      registrationFailed: false,
    })).toBe('CommandOrControl+Shift+.');
    expect(
      DesktopShortcutRuntimeClient.resolveGlobalAgentStopShortcutFallbackAccelerator({
        resolvedAccelerator: 'CommandOrControl+Shift+.',
        usingFallback: true,
        registrationFailed: true,
      }),
    ).toBeNull();
    expect(DesktopShortcutRuntimeClient.resolveGlobalAgentStopShortcutFallbackAccelerator({
      resolvedAccelerator: '   ',
      usingFallback: true,
      registrationFailed: false,
    })).toBeNull();
    expect(DesktopShortcutRuntimeClient.resolveGlobalAgentStopShortcutFallbackAccelerator({
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: false,
      registrationFailed: false,
    })).toBeNull();
  });

  test('compares global stop shortcut status values through shortcut fields', () => {
    const currentStatus = {
      requestedAccelerator: 'CommandOrControl+Alt+.',
      resolvedAccelerator: 'CommandOrControl+Shift+.',
      usingFallback: true,
      registrationFailed: false,
      ignoredMetadata: 'current',
    };

    expect(DesktopShortcutRuntimeModule).not.toHaveProperty('areGlobalAgentStopShortcutStatusesEqual');
    expect(DesktopShortcutRuntimeClient.areGlobalAgentStopShortcutStatusesEqual(
      currentStatus,
      {
        requestedAccelerator: 'CommandOrControl+Alt+.',
        resolvedAccelerator: 'CommandOrControl+Shift+.',
        usingFallback: true,
        registrationFailed: false,
        ignoredMetadata: 'next',
      },
    )).toBe(true);
    expect(DesktopShortcutRuntimeClient.areGlobalAgentStopShortcutStatusesEqual(
      currentStatus,
      {
        requestedAccelerator: 'CommandOrControl+Alt+.',
        resolvedAccelerator: 'CommandOrControl+Alt+.',
        usingFallback: false,
        registrationFailed: false,
      },
    )).toBe(false);
    expect(DesktopShortcutRuntimeClient.areGlobalAgentStopShortcutStatusesEqual(null, null)).toBe(true);
  });
});
