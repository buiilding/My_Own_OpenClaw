/** @jest-environment node */

const {
  isVmModeEnabled,
  isVmWorkerModeEnabled,
} = require('../../frontend/src/main/app/runtime_mode.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

const windieVmWorkerEnv = mainHostSkin.vmWorker.env;

describe('runtime_mode', () => {
  test('detects VM mode only when WINDIE_VM_MODE is set to 1', () => {
    expect(isVmModeEnabled({ WINDIE_VM_MODE: '1' }, windieVmWorkerEnv)).toBe(
      true,
    );
    expect(isVmModeEnabled({ WINDIE_VM_MODE: '0' }, windieVmWorkerEnv)).toBe(
      false,
    );
    expect(isVmModeEnabled({}, windieVmWorkerEnv)).toBe(false);
    expect(isVmModeEnabled({ WINDIE_VM_MODE: ' 1 ' }, windieVmWorkerEnv)).toBe(
      true,
    );
  });

  test('defaults worker mode to VM mode unless WINDIE_VM_WORKER_MODE overrides it', () => {
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '1' }, windieVmWorkerEnv)).toBe(
      true,
    );
    expect(isVmWorkerModeEnabled({ WINDIE_VM_MODE: '0' }, windieVmWorkerEnv)).toBe(
      false,
    );
    expect(isVmWorkerModeEnabled({
      WINDIE_VM_MODE: '1',
      WINDIE_VM_WORKER_MODE: '0',
    }, windieVmWorkerEnv)).toBe(false);
    expect(isVmWorkerModeEnabled({
      WINDIE_VM_MODE: '0',
      WINDIE_VM_WORKER_MODE: '1',
    }, windieVmWorkerEnv)).toBe(true);
    expect(isVmWorkerModeEnabled({}, windieVmWorkerEnv)).toBe(false);
  });
});
