/** @jest-environment node */

const settingsSyncModule = require('../../src/main/ipc/ipc_settings_sync.cjs');
const {
  isValidConfigPayload,
} = settingsSyncModule;

describe('ipc_settings_sync', () => {
  test('isValidConfigPayload accepts plain objects only', () => {
    expect(isValidConfigPayload({ key: 'value' })).toBe(true);
    expect(isValidConfigPayload(null)).toBe(false);
    expect(isValidConfigPayload([])).toBe(false);
    expect(isValidConfigPayload('value')).toBe(false);
  });

  test('keeps settings ACK gate primitives private to the runtime owner', () => {
    expect(settingsSyncModule.clearPendingSettingsSyncs).toBeUndefined();
    expect(settingsSyncModule.resolveSettingsSync).toBeUndefined();
    expect(settingsSyncModule.waitForSettingsAck).toBeUndefined();
  });
});
