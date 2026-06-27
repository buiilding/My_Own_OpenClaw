/**
 * Covers renderer startup runtime client behavior in the frontend test suite.
 */

import { DesktopStartupRuntimeClient } from '../../src/renderer/app/runtime/desktopStartupRuntimeClient';

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

  test('resolves the renderer root element through the startup document adapter', () => {
    const root = document.createElement('div');
    const getElementById = jest.fn((id: string) => (id === 'root' ? root : null));

    expect(DesktopStartupRuntimeClient.getRendererRootElement({ getElementById })).toBe(root);
    expect(getElementById).toHaveBeenCalledWith('root');
    expect(DesktopStartupRuntimeClient.getRendererRootElement(null)).toBeNull();
  });
});
