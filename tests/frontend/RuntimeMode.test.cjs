/** @jest-environment node */

const {
  isVmModeEnabled,
  isVmWorkerModeEnabled,
} = require('../../frontend/src/main/runtime_mode.cjs');

describe('runtime_mode', () => {
  test('detects VM mode only when WINDIE_VM_MODE is set to 1', () => {
    expect(isVmModeEnabled({ WINDIE_VM_MODE: '1' })).toBe(true);
    expect(isVmModeEnabled({ WINDIE_VM_MODE: '0' })).toBe(false);
    expect(isVmModeEnabled({})).toBe(false);
    expect(isVmModeEnabled({ WINDIE_VM_MODE: ' 1 ' })).toBe(true);
  });

  test('defaults worker mode to VM mode unless WINDIE_VM_WORKER_MODE overrides it', () => {
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '1' })).toBe(true);
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '0' })).toBe(false);
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '1', WINDIE_VM_WORKER_MODE: '0' })).toBe(false);
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '0', WINDIE_VM_WORKER_MODE: '1' })).toBe(true);
    expect(isVmWorkerModeEnabled({})).toBe(false);
  });
});
