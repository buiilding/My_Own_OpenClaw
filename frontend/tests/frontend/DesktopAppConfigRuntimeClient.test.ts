/**
 * Covers desktop app config runtime client behavior in the frontend test suite.
 */

const mockInvoke = jest.fn();
let mockSettingsListeners: Array<(payload?: unknown) => void> = [];

jest.mock('../../src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (_channel: string, listener: (payload?: unknown) => void) => {
      mockSettingsListeners.push(listener);
      return () => {
        mockSettingsListeners = mockSettingsListeners.filter(candidate => candidate !== listener);
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

import * as DesktopAppConfigRuntimeModule from '../../src/renderer/app/runtime/desktopAppConfigRuntimeClient';
import { DesktopAppConfigRuntimeClient } from '../../src/renderer/app/runtime/desktopAppConfigRuntimeClient';

function emitSettingsEvent(payload: unknown) {
  for (const listener of mockSettingsListeners) {
    listener(payload);
  }
}

describe('DesktopAppConfigRuntimeClient', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSettingsListeners = [];
  });

  test('keeps raw settings event helpers private to the runtime client', () => {
    expect(DesktopAppConfigRuntimeModule).not.toHaveProperty('normalizeDesktopSettingsEvent');
    expect(DesktopAppConfigRuntimeModule).not.toHaveProperty('resolveDesktopSettingsSaveStatusAction');
  });

  test('settings event subscriptions emit normalized settings update error events', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopAppConfigRuntimeClient.onSettingsEvent(event => {
      events.push(event);
    });

    emitSettingsEvent({
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
    });
    emitSettingsEvent({
      type: 'error',
      payload: { message: 'Database timeout' },
    });

    expect(events).toEqual([{
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
      isSettingsUpdateError: true,
    }, {
      type: 'error',
      payload: { message: 'Database timeout' },
      isSettingsUpdateError: false,
    }]);

    unsubscribe?.();
    expect(mockSettingsListeners).toHaveLength(0);
  });

  test('settings save status subscriptions emit value-level actions only', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopAppConfigRuntimeClient.onSettingsSaveStatusAction(status => {
      events.push(status);
    });

    emitSettingsEvent({
      type: 'settings-updated',
      payload: {},
    });
    emitSettingsEvent({
      type: 'models-listed',
      payload: {},
    });
    emitSettingsEvent({
      type: 'error',
      payload: { message: 'Database timeout' },
    });
    emitSettingsEvent({
      type: 'error',
      payload: { message: 'Failed to update settings: write failed' },
    });

    expect(events).toEqual(['success', 'error']);

    unsubscribe?.();
    expect(mockSettingsListeners).toHaveLength(0);
  });

  test('settings event subscriptions emit normalized settings events', () => {
    const events: unknown[] = [];
    const unsubscribe = DesktopAppConfigRuntimeClient.onSettingsEvent(event => {
      events.push(event);
    });

    emitSettingsEvent({
      type: 'settings-updated',
      payload: {},
    });

    expect(events).toEqual([{
      type: 'settings-updated',
      payload: {},
      isSettingsUpdateError: false,
    }]);

    unsubscribe?.();
    expect(mockSettingsListeners).toHaveLength(0);
  });
});
