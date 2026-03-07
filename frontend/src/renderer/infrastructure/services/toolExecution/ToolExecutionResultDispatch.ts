import type { ToolExecutionCallbacks } from './ToolExecutionTypes';
import {
  buildToolBundleBackendEnvelope,
  buildToolResultBackendEnvelope,
  type BundleExecutionStatus,
} from './ToolExecutionBackendPayload';
import type { ToolResult, SystemState } from '../MessageFormatter';
import type { BundleStepResult } from './ToolExecutionBundleRunner';
import type { CaptureMeta } from '../SystemCapture';
import type { BundleExecutionResult, ToolExecutionResult } from './ToolExecutionTypes';

export function emitToolExecutionResult(
  callbacks: ToolExecutionCallbacks,
  result: ToolExecutionResult,
): void {
  callbacks.onToolResult?.(result);
}

export function emitToolExecutionBundleResult(
  callbacks: ToolExecutionCallbacks,
  result: BundleExecutionResult,
): void {
  callbacks.onBundleResult?.(result);
}

type SendToolResultOptions = {
  correlationId: string | undefined;
  result: ToolResult;
  formattedMessage: string;
  systemState: SystemState | null;
  includeScreenshot: boolean;
  screenshot?: string | null;
  screenshotRef?: string | null;
  includeSystemState?: boolean;
};

export function sendToolExecutionResultToBackend(
  callbacks: ToolExecutionCallbacks,
  options: SendToolResultOptions,
): void {
  if (!callbacks.sendToBackend) {
    return;
  }
  callbacks.sendToBackend(
    buildToolResultBackendEnvelope({
      ...options,
      includeSystemState: options.includeSystemState ?? false,
    }),
  );
}

type SendBundleResultOptions = {
  bundleId: string;
  status: BundleExecutionStatus;
  stepResults: BundleStepResult[];
  screenshot: string | null;
  screenshotRef: string | null;
  captureMeta: CaptureMeta | null;
  systemState: SystemState | null;
  error: string | null;
  includeScreenshot: boolean;
  includeSystemState: boolean;
};

export function sendToolExecutionBundleResultToBackend(
  callbacks: ToolExecutionCallbacks,
  options: SendBundleResultOptions,
): void {
  if (!callbacks.sendToBackend) {
    return;
  }
  callbacks.sendToBackend(
    buildToolBundleBackendEnvelope({
      bundleId: options.bundleId,
      status: options.status,
      stepResults: options.stepResults,
      screenshot: options.screenshot,
      screenshotRef: options.screenshotRef,
      captureMeta: options.captureMeta,
      systemState: options.systemState,
      error: options.error,
      includeScreenshot: options.includeScreenshot,
      includeSystemState: options.includeSystemState,
    }),
  );
}
