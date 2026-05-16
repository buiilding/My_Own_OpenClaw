import type { ToolResult } from '../MessageFormatter';

export type BundleStatus = 'success' | 'partial_failure' | 'failure';

export type BundleStepResult = {
  tool: string;
  status: 'ok' | 'error';
  output: string;
};

export interface BundledToolResult {
  tool_name: string;
  request_id?: string;
  success: boolean;
  error?: string | null;
  data?: {
    output: string;
  };
  executionTime?: number;
  _rawResult?: ToolResult;
}

export function buildBundledToolResult(step: BundleStepResult): BundledToolResult {
  const success = step.status === 'ok';
  const output = step.output;
  return {
    tool_name: step.tool,
    request_id: '',
    success,
    data: {
      output,
    },
    error: success ? null : output,
    executionTime: 0,
    _rawResult: {
      success,
      error: success ? null : output,
      data: {
        output,
      },
    },
  };
}

export function buildBundledToolResults(
  stepResults: BundleStepResult[],
): BundledToolResult[] {
  return stepResults.map(buildBundledToolResult);
}

export function resolveBundleStatus(
  stepResults: BundleStepResult[],
  bundleLength: number,
): BundleStatus {
  if (stepResults.length < bundleLength) {
    return 'partial_failure';
  }

  if (stepResults.every((step) => step.status === 'ok')) {
    return 'success';
  }

  return 'failure';
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
