/**
 * Provides the tool execution logger module for the renderer UI.
 */

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
