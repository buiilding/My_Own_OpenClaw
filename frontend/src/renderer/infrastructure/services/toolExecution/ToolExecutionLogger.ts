declare global {
  interface Window {
    __WINDIE_VERBOSE_TOOL_LOGS__?: boolean;
  }
}

function shouldLogInfo(): boolean {
  if (typeof window !== 'undefined' && typeof window.__WINDIE_VERBOSE_TOOL_LOGS__ === 'boolean') {
    return window.__WINDIE_VERBOSE_TOOL_LOGS__;
  }
  return !(
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV === 'test'
  );
}

function logInfo(message?: any, ...optionalParams: any[]): void {
  if (!shouldLogInfo()) {
    return;
  }
  console.log(message, ...optionalParams);
}

function shortCorrelationId(correlationId?: string): string {
  return correlationId ? correlationId.substring(0, 15) : 'unknown';
}

export function logScreenshotCaptureTiming(params: {
  correlationId?: string | null;
  waitTime: number;
  preparationTime: number;
  hideInvokeTime: number;
  settleTime: number;
  focusPrepTime: number;
  screenshotInvokeTime: number;
  restoreVisibilityTime: number;
  totalTime: number;
}): void {
  const {
    correlationId,
    waitTime,
    preparationTime,
    hideInvokeTime,
    settleTime,
    focusPrepTime,
    screenshotInvokeTime,
    restoreVisibilityTime,
    totalTime,
  } = params;
  logInfo(
    `[Timing] Screenshot capture completed ` +
    `(wait: ${waitTime.toFixed(3)}s, prep: ${preparationTime.toFixed(3)}s, ` +
    `hide IPC: ${hideInvokeTime.toFixed(3)}s, settle: ${settleTime.toFixed(3)}s, ` +
    `focus: ${focusPrepTime.toFixed(3)}s, screenshot IPC: ${screenshotInvokeTime.toFixed(3)}s, ` +
    `restore: ${restoreVisibilityTime.toFixed(3)}s, total: ${totalTime.toFixed(3)}s) ` +
    `(capture_id=${shortCorrelationId(correlationId || undefined)})`,
  );
}

export function logSystemStateCaptureTiming(params: {
  correlationId?: string | null;
  waitTime: number;
  focusPrepTime: number;
  systemStateInvokeTime: number;
  totalTime: number;
  includeWindows: boolean;
}): void {
  const {
    correlationId,
    waitTime,
    focusPrepTime,
    systemStateInvokeTime,
    totalTime,
    includeWindows,
  } = params;
  logInfo(
    `[Timing] System state capture completed ` +
    `(wait: ${waitTime.toFixed(3)}s, focus: ${focusPrepTime.toFixed(3)}s, ` +
    `state IPC: ${systemStateInvokeTime.toFixed(3)}s, total: ${totalTime.toFixed(3)}s, ` +
    `includeWindows=${includeWindows}) ` +
    `(capture_id=${shortCorrelationId(correlationId || undefined)})`,
  );
}
