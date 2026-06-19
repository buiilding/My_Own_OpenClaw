/**
 * Covers desktop app config runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let settingsListener: ((payload?: unknown) => void) | null = null;

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      settingsListener = listener;
      return () => {
        settingsListener = null;
      };
    },
  },
  INVOKE_CHANNELS: {
    LOAD_FRONTEND_CONFIG: 'load-frontend-config',
    SAVE_FRONTEND_CONFIG: 'save-frontend-config',
  },
  ON_CHANNELS: {
    BACKEND_SETTINGS_EVENT: 'backend-settings-event',
  },
}));

import {
  DesktopAppConfigRuntimeClient,
  normalizeDesktopSettingsEvent,
} from '../../frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient';

describe('DesktopAppConfigRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    settingsListener = null;
  });

  test('normalizes settings update error events at the runtime boundary', () => {
    expect(normalizeDesktopSettingsEvent({
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
    })).toEqual({
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
      isSettingsUpdateError: true,
    });

    expect(normalizeDesktopSettingsEvent({
      type: 'error',
      payload: { message: 'Database timeout' },
    })).toEqual({
      type: 'error',
      payload: { message: 'Database timeout' },
      isSettingsUpdateError: false,
    });
  });

  test('settings event subscriptions emit normalized settings events', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopAppConfigRuntimeClient.onSettingsEvent(event => {
      events.push(event);
    });

    settingsListener?.({
      type: 'settings-updated',
      payload: {},
    });

    expect(events).toEqual([{
      type: 'settings-updated',
      payload: {},
      isSettingsUpdateError: false,
    }]);

    unsubscribe?.();
    expect(settingsListener).toBeNull();
  });
});
