/**
 * Covers renderer startup runtime client behavior in the frontend test suite.
 */

import { DesktopStartupRuntimeClient } from '../../frontend/src/renderer/app/runtime/desktopStartupRuntimeClient';

describe('DesktopStartupRuntimeClient', () => {
  test('resolves known renderer entrypoint views from the browser URL', () => {
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView({
      location: { search: '?view=minimal-chat-pill' } as Location,
    })).toBe('minimal-chat-pill');
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView({
      location: { search: '?view=minimal-response-overlay' } as Location,
    })).toBe('minimal-response-overlay');
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView({
      location: { search: '?view=tool-ghost-debug' } as Location,
    })).toBe('tool-ghost-debug');
  });

  test('falls back to main for missing or unsupported renderer entrypoint views', () => {
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView({
      location: { search: '' } as Location,
    })).toBe('main');
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView({
      location: { search: '?view=unknown' } as Location,
    })).toBe('main');
    expect(DesktopStartupRuntimeClient.getRendererEntrypointView(null)).toBe('main');
  });

  test('suppresses wakeword startup on secondary renderer views', () => {
    expect(DesktopStartupRuntimeClient.shouldSuppressWakewordOnStartup({
      location: { search: '?view=minimal-chat-pill' } as Location,
    })).toBe(true);
    expect(DesktopStartupRuntimeClient.shouldSuppressWakewordOnStartup({
      location: { search: '?view=minimal-response-overlay' } as Location,
    })).toBe(true);
    expect(DesktopStartupRuntimeClient.shouldSuppressWakewordOnStartup({
      location: { search: '' } as Location,
    })).toBe(false);
  });
});
