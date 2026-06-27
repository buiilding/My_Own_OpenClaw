/** @jest-environment node */

const {
  isVmModeEnabled,
  isVmWorkerModeEnabled,
} = require('../../src/main/app/runtime_mode.cjs');

const sampleRuntimeModeEnv = Object.freeze({
  vmMode: 'SAMPLE_VM_MODE',
  vmWorkerMode: 'SAMPLE_VM_WORKER_MODE',
});

describe('runtime_mode', () => {
  test('detects VM mode only when configured host env key is set to 1', () => {
    expect(isVmModeEnabled({ SAMPLE_VM_MODE: '1' }, sampleRuntimeModeEnv)).toBe(
      true,
    );
    expect(isVmModeEnabled({ SAMPLE_VM_MODE: '0' }, sampleRuntimeModeEnv)).toBe(
      false,
    );
    expect(isVmModeEnabled({}, sampleRuntimeModeEnv)).toBe(false);
    expect(isVmModeEnabled({ SAMPLE_VM_MODE: ' 1 ' }, sampleRuntimeModeEnv)).toBe(
      true,
    );
  });

  test('defaults worker mode to VM mode unless configured host worker key overrides it', () => {
    expect(isVmWorkerModeEnabled({ SAMPLE_VM_MODE: '1' }, sampleRuntimeModeEnv)).toBe(
      true,
    );
    expect(isVmWorkerModeEnabled({ SAMPLE_VM_MODE: '0' }, sampleRuntimeModeEnv)).toBe(
      false,
    );
    expect(isVmWorkerModeEnabled({
      SAMPLE_VM_MODE: '1',
      SAMPLE_VM_WORKER_MODE: '0',
    }, sampleRuntimeModeEnv)).toBe(false);
    expect(isVmWorkerModeEnabled({
      SAMPLE_VM_MODE: '0',
      SAMPLE_VM_WORKER_MODE: '1',
    }, sampleRuntimeModeEnv)).toBe(true);
    expect(isVmWorkerModeEnabled({}, sampleRuntimeModeEnv)).toBe(false);
  });
});
