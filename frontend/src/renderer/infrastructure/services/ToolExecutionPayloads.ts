import type { BundledToolResult, ToolResult } from './MessageFormatter';
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

export function buildToolResultPayloadData(
  result: ToolResult,
  formattedMessage: string,
  screenshotRef?: string | null,
): Record<string, unknown> {
  const rawData =
    result.data && typeof result.data === 'object' && !Array.isArray(result.data)
      ? (result.data as Record<string, unknown>)
      : {};
  const { screenshot: _screenshot, image_data: _imageData, ...payloadData } = rawData;

  const normalizedPayload: Record<string, unknown> = {
    ...payloadData,
    llm_content: formattedMessage,
    is_preformatted: true,
  };
  if (screenshotRef) {
    normalizedPayload.screenshot_ref = screenshotRef;
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
