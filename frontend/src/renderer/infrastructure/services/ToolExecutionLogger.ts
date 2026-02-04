export function shortCorrelationId(correlationId?: string): string {
  return correlationId ? correlationId.substring(0, 15) : 'unknown';
}

export function logToolStart(toolName: string, correlationId?: string): string {
  const shortId = shortCorrelationId(correlationId);
  console.log(`[Timing] Tool execution started: ${toolName} (request_id=${shortId})`);
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
    console.log(
      `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s total ` +
      `(IPC: ${toolInvokeTime.toFixed(3)}s, wait: ${waitDelay.toFixed(3)}s, capture: ${captureTime.toFixed(3)}s) ` +
      `(request_id=${shortId})`
    );
  } else {
    console.log(
      `[Timing] Tool execution completed: ${toolName} took ${totalExecutionTime.toFixed(3)}s ` +
      `(IPC: ${toolInvokeTime.toFixed(3)}s) (request_id=${shortId})`
    );
  }
}

export function logBundleStart(bundleSize: number, bundleId: string): void {
  console.log(`[Timing] Bundle execution started: ${bundleSize} tools (bundle_id=${bundleId})`);
  console.log('[ToolExecutionService] Executing atomic bundle of size:', bundleSize);
  console.log('[ToolExecutionService] Bundle ID:', bundleId);
}

export function logBundledToolTiming(toolName: string, toolExecutionTime: number): void {
  console.log(`[Timing] Bundled tool IPC: ${toolName} took ${toolExecutionTime.toFixed(3)}s`);
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
    console.log(
      `[Timing] Bundle execution completed: ${stepCount} steps took ${bundleExecutionTime.toFixed(3)}s total ` +
      `(tools: ${totalToolTime.toFixed(3)}s, wait: ${totalWaitDelay.toFixed(3)}s, capture: ${totalCaptureTime.toFixed(3)}s) ` +
      `(bundle_id=${bundleId})`
    );
  } else {
    console.log(
      `[Timing] Bundle execution completed: ${stepCount} steps took ${bundleExecutionTime.toFixed(3)}s ` +
      `(tools: ${totalToolTime.toFixed(3)}s) (bundle_id=${bundleId})`
    );
  }
}

export function logBundleFailure(bundleId: string, bundleTotalTime: number, error: unknown): void {
  console.error(`[Timing] Bundle execution failed after ${bundleTotalTime.toFixed(3)}s:`, error);
  console.error('[ToolExecutionService] Bundle execution failed:', error);
}
