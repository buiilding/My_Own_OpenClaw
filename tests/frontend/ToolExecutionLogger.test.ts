/**
 * Covers tool execution logger. behavior in the frontend test suite.
 */

import {
  logSystemStateCaptureTiming,
} from '../../frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionLogger';

describe('ToolExecutionLogger', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete (window as any).__WINDIE_VERBOSE_TOOL_LOGS__;
  });

  test('does not emit info logs in test mode by default', () => {
    logSystemStateCaptureTiming({
      correlationId: null,
      waitTime: 0.1,
      focusPrepTime: 0.2,
      systemStateInvokeTime: 0.3,
      totalTime: 0.6,
      includeWindows: true,
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('emits system-state timing logs when verbose flag is enabled', () => {
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = true;

    logSystemStateCaptureTiming({
      correlationId: '1234567890abcdef',
      waitTime: 0.1,
      focusPrepTime: 0.2,
      systemStateInvokeTime: 0.3,
      totalTime: 0.6,
      includeWindows: true,
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('capture_id=1234567890abcde'));
  });
});
