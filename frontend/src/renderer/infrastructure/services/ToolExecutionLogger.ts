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

export function shortCorrelationId(correlationId?: string): string {
  return correlationId ? correlationId.substring(0, 15) : 'unknown';
}

export function logToolStart(toolName: string, correlationId?: string): string {
  const shortId = shortCorrelationId(correlationId);
  logInfo(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);
  return shortId;
}

export function logToolTiming(params: {
  toolName: string;
  totalExecutionTime: number;
  toolInvokeTime: number;
  waitDelay: number;
  captureTime: number;
  shortId: string;
  isComputerTool: boolean;
  skipAutoCapture?: boolean;
}): void {
  const {
    toolName,
    totalExecutionTime,
    toolInvokeTime,
    waitDelay,
    captureTime,
    shortId,
    isComputerTool,
    skipAutoCapture
  } = params;
  if (isComputerTool && !skipAutoCapture) {
    logInfo(
      `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s total ` +
      `(IPC: ${toolInvokeTime.toFixed(3)}s, wait: ${waitDelay.toFixed(3)}s, capture: ${captureTime.toFixed(3)}s) ` +
      `(request_id=${shortId})`
    );
  } else {
    logInfo(
      `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s ` +
      `(IPC: ${toolInvokeTime.toFixed(3)}s) (request_id=${shortId})`
    );
  }
}

export function logBundleStart(bundleSize: number, bundleId: string): void {
  logInfo(`[Timing] Bundle execution started: ${bundleSize} tools (bundle_id=${bundleId})`);
  logInfo('[ToolExecutionService] Executing atomic bundle of size:', bundleSize);
  logInfo('[ToolExecutionService] Bundle ID:', bundleId);
}

export function logBundledToolStart(step: number, totalSteps: number, toolName: string): void {
  logInfo(`[ToolExecutionService] Executing bundled tool ${step}/${totalSteps}: ${toolName}`);
}

export function logBundledToolTiming(toolName: string, toolExecutionTime: number): void {
  logInfo(`[Timing] Bundled tool IPC: ${toolName} took ${toolExecutionTime.toFixed(3)}s`);
}

export function logBundleFormatting(formattingTime: number): void {
  logInfo(`[Timing] Message formatting took ${formattingTime.toFixed(3)}s`);
}

export function logBundleDispatch(): void {
  logInfo('[ToolExecutionService] Sending atomic tool-bundle-result');
}

export function logBundleTiming(params: {
  stepCount: number;
  bundleExecutionTime: number;
  totalToolTime: number;
  totalWaitDelay: number;
  totalCaptureTime: number;
  bundleId: string;
  captured: boolean;
}): void {
  const {
    stepCount,
    bundleExecutionTime,
    totalToolTime,
    totalWaitDelay,
    totalCaptureTime,
    bundleId,
    captured
  } = params;
  if (captured) {
    logInfo(
      `[Timing] Bundle execution completed: ${stepCount} steps took ${bundleExecutionTime.toFixed(3)}s total ` +
      `(tools: ${totalToolTime.toFixed(3)}s, wait: ${totalWaitDelay.toFixed(3)}s, capture: ${totalCaptureTime.toFixed(3)}s) ` +
      `(bundle_id=${bundleId})`
    );
  } else {
    logInfo(
      `[Timing] Bundle execution completed: ${stepCount} steps took ${bundleExecutionTime.toFixed(3)}s ` +
      `(tools: ${totalToolTime.toFixed(3)}s) (bundle_id=${bundleId})`
    );
  }
}

export function logBundleFailure(bundleId: string, bundleTotalTime: number, error: unknown): void {
  console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
  console.error('[ToolExecutionService] Bundle execution failed:', error);
}
