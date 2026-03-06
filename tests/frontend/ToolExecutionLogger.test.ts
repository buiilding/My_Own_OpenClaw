import {
  logBundleDispatch,
  logBundleFormatting,
  logBundleStart,
  logBundledToolStart,
  logBundledToolTiming,
  logBundleTiming,
  logToolStart,
  logToolTiming,
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

  test('logToolStart returns truncated ids and default unknown id', () => {
    expect(logToolStart('read_file', '1234567890abcdef')).toBe('1234567890abcde');
    expect(logToolStart('read_file', undefined)).toBe('unknown');
  });

  test('does not emit info logs in test mode by default', () => {
    logToolStart('read_file', 'req-123');
    logToolTiming({
      toolName: 'read_file',
      totalExecutionTime: 1,
      toolInvokeTime: 0.2,
      waitDelay: 0,
      captureTime: 0,
      shortId: 'req-123',
      isComputerTool: false,
      skipAutoCapture: false,
    });
    logBundleStart(2, 'bundle-1');
    logBundledToolStart(1, 2, 'read_file');
    logBundledToolTiming('read_file', 0.1);
    logBundleFormatting(0.2);
    logBundleDispatch();
    logBundleTiming({
      stepCount: 2,
      bundleExecutionTime: 1.5,
      totalToolTime: 0.8,
      totalWaitDelay: 0.4,
      totalCaptureTime: 0.3,
      bundleId: 'bundle-1',
      captured: true,
    });

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('emits info logs when verbose flag is enabled', () => {
    (window as any).__WINDIE_VERBOSE_TOOL_LOGS__ = true;

    logToolStart('read_file', 'req-123');
    logBundleStart(1, 'bundle-1');
    logBundleDispatch();

    expect(logSpy).toHaveBeenCalled();
  });
});
