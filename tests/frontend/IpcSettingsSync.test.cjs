/** @jest-environment node */

const {
  clearPendingSettingsSyncs,
  isValidConfigPayload,
  resolveSettingsSync,
  waitForSettingsAck,
} = require('../../frontend/src/main/ipc/ipc_settings_sync.cjs');

describe('ipc_settings_sync', () => {
  test('isValidConfigPayload accepts plain objects only', () => {
    expect(isValidConfigPayload({ key: 'value' })).toBe(true);
    expect(isValidConfigPayload(null)).toBe(false);
    expect(isValidConfigPayload([])).toBe(false);
    expect(isValidConfigPayload('value')).toBe(false);
  });

  test('clearPendingSettingsSyncs resolves all pending entries with false', () => {
    const pendingSettingsSyncs = new Map();
    const resolveA = jest.fn();
    const resolveB = jest.fn();

    pendingSettingsSyncs.set('a', { resolve: resolveA, timer: setTimeout(() => {}, 1000) });
    pendingSettingsSyncs.set('b', { resolve: resolveB, timer: setTimeout(() => {}, 1000) });

    clearPendingSettingsSyncs(pendingSettingsSyncs);

    expect(resolveA).toHaveBeenCalledWith(false);
    expect(resolveB).toHaveBeenCalledWith(false);
    expect(pendingSettingsSyncs.size).toBe(0);
  });

  test('resolveSettingsSync resolves and removes matching pending ack', () => {
    const pendingSettingsSyncs = new Map();
    const resolve = jest.fn();
    pendingSettingsSyncs.set('ack-1', { resolve, timer: setTimeout(() => {}, 1000) });

    resolveSettingsSync(pendingSettingsSyncs, 'ack-1', true);

    expect(resolve).toHaveBeenCalledWith(true);
    expect(pendingSettingsSyncs.has('ack-1')).toBe(false);
  });

  test('waitForSettingsAck times out and logs source context', async () => {
    jest.useFakeTimers();
    const pendingSettingsSyncs = new Map();
    const log = jest.fn();

    const ackPromise = waitForSettingsAck(
      pendingSettingsSyncs,
      'ack-timeout',
      'query-gate',
      log,
      2500,
    );

    expect(pendingSettingsSyncs.has('ack-timeout')).toBe(true);

    jest.advanceTimersByTime(2500);
    await expect(ackPromise).resolves.toBe(false);
    expect(pendingSettingsSyncs.has('ack-timeout')).toBe(false);
    expect(log).toHaveBeenCalledWith(
      'Settings sync timeout (query-gate) for message ack-timeout',
    );

    jest.useRealTimers();
  });
});
