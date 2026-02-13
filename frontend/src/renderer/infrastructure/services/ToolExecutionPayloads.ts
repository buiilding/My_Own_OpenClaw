import type { BundledToolResult, SystemState, ToolResult } from './MessageFormatter';
import type { BundleStepResult } from './ToolExecutionBundleRunner';

export type BundleStatus = 'success' | 'partial_failure' | 'failure';

export type NormalizedBundleResult = {
  tool_name: string;
  _rawResult: ToolResult;
  success: boolean;
  error: string | null;
  data: {
    output: string;
  };
};

export type ToolResultPayloadOptions = {
  screenshotRef?: string | null;
  systemState?: SystemState | null;
  includeScreenshot?: boolean;
};

type RequiredSystemState = {
  active_window: string;
  mouse_position: string;
};

function pickSystemStateCandidate(
  preferred: SystemState | null | undefined,
  fallback: unknown,
): Record<string, unknown> {
  if (preferred && typeof preferred === 'object') {
    return preferred as Record<string, unknown>;
  }
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return fallback as Record<string, unknown>;
  }
  return {};
}

function asRequiredSystemState(
  preferred: SystemState | null | undefined,
  fallback: unknown,
): RequiredSystemState {
  const candidate = pickSystemStateCandidate(preferred, fallback);
  const activeWindowValue = candidate['active_window'];
  const activeWindowCamelValue = candidate['activeWindow'];
  const mousePositionValue = candidate['mouse_position'];
  const mousePositionCamelValue = candidate['mousePosition'];
  const activeWindow =
    typeof activeWindowValue === 'string' && activeWindowValue.length > 0
      ? activeWindowValue
      : typeof activeWindowCamelValue === 'string' && activeWindowCamelValue.length > 0
        ? activeWindowCamelValue
        : 'Unknown';
  const mousePosition =
    typeof mousePositionValue === 'string' && mousePositionValue.length > 0
      ? mousePositionValue
      : typeof mousePositionCamelValue === 'string' && mousePositionCamelValue.length > 0
        ? mousePositionCamelValue
        : 'Unknown';

  return {
    active_window: activeWindow,
    mouse_position: mousePosition,
  };
}

export function buildToolResultPayloadData(
  result: ToolResult,
  formattedMessage: string,
  options: ToolResultPayloadOptions = {},
): Record<string, unknown> {
  const rawData =
    result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const {
    screenshot: _screenshot,
    image_data: _imageData,
    screenshot_ref: rawScreenshotRef,
    system_state: rawSystemState,
    ...payloadData
  } = rawData;

  const normalizedPayload: Record<string, unknown> = {
    ...payloadData,
    llm_content: formattedMessage,
    system_state: asRequiredSystemState(options.systemState, rawSystemState),
  };

  if (options.includeScreenshot) {
    const selectedScreenshotRef =
      options.screenshotRef ||
      (typeof rawScreenshotRef === 'string' && rawScreenshotRef.length > 0
        ? rawScreenshotRef
        : null);
    if (selectedScreenshotRef) {
      normalizedPayload.screenshot_ref = selectedScreenshotRef;
    }
  }

  return normalizedPayload;
}

export function resolveBundleStatus(
  stepResults: BundleStepResult[],
  bundleLength: number,
): BundleStatus {
  const allSuccess = stepResults.every((step) => step.status === 'ok');
  if (allSuccess) {
    return 'success';
  }

  const hasFailures = stepResults.some((step) => step.status === 'error');
  if (hasFailures && stepResults.length < bundleLength) {
    return 'partial_failure';
  }

  return 'failure';
}

export function normalizeBundleStepResults(
  stepResults: BundleStepResult[],
): NormalizedBundleResult[] {
  return stepResults.map((step) => ({
    tool_name: step.tool,
    _rawResult: {
      success: step.status === 'ok',
      error: step.status === 'error' ? step.output : null,
      data: {
        output: step.output,
      },
    },
    success: step.status === 'ok',
    error: step.status === 'error' ? step.output : null,
    data: {
      output: step.output,
    },
  }));
}

export function toBundleExecutionResults(
  normalizedResults: NormalizedBundleResult[],
): BundledToolResult[] {
  return normalizedResults.map((step) => ({
    tool_name: step.tool_name,
    request_id: '',
    success: step.success,
    data: step.data,
    error: step.error,
    executionTime: 0,
    _rawResult: step._rawResult,
  }));
}

export function resolveBundleErrorMessage(
  bundleStatus: BundleStatus,
  stepResults: BundleStepResult[],
): string | null {
  if (bundleStatus !== 'failure') {
    return null;
  }
  const failedStep = stepResults.find((step) => step.status === 'error');
  return failedStep?.output || 'Bundle execution failed';
}
