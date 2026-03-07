import type { SystemState, ToolResult } from '../MessageFormatter';
import type { CaptureMeta } from '../SystemCapture';
import type { BundleStepResult } from './ToolExecutionBundleRunner';
import { buildToolResultPayloadData } from './ToolExecutionPayloads';
import {
  buildToolBundleResultEnvelope,
  buildToolResultEnvelope,
} from './ToolResultEnvelope';

export type BundleExecutionStatus = 'success' | 'partial_failure' | 'failure';

type BuildToolResultBackendEnvelopeArgs = {
  correlationId?: string;
  result: ToolResult;
  formattedMessage: string;
  screenshot?: string | null;
  screenshotRef?: string | null;
  systemState?: SystemState | null;
  includeScreenshot?: boolean;
  includeSystemState?: boolean;
};

type BuildToolBundleBackendEnvelopeArgs = {
  bundleId: string;
  status: BundleExecutionStatus;
  stepResults: BundleStepResult[];
  error?: string | null;
  screenshot?: string | null;
  screenshotRef?: string | null;
  captureMeta?: CaptureMeta | null;
  systemState?: SystemState | null;
  includeScreenshot?: boolean;
  includeSystemState?: boolean;
};

export function buildToolResultBackendEnvelope({
  correlationId,
  result,
  formattedMessage,
  screenshot = null,
  screenshotRef = null,
  systemState = null,
  includeScreenshot = false,
  includeSystemState = false,
}: BuildToolResultBackendEnvelopeArgs) {
  const payloadData = buildToolResultPayloadData(result, formattedMessage, {
    screenshot,
    screenshotRef,
    systemState,
    includeScreenshot,
    includeSystemState,
  });

  return buildToolResultEnvelope({
    request_id: correlationId,
    success: result.success,
    data: payloadData,
    error: result.error,
  });
}

export function buildToolBundleBackendEnvelope({
  bundleId,
  status,
  stepResults,
  error = null,
  screenshot = null,
  screenshotRef = null,
  captureMeta = null,
  systemState = null,
  includeScreenshot = false,
  includeSystemState = false,
}: BuildToolBundleBackendEnvelopeArgs) {
  const payload: Record<string, unknown> = {
    bundle_id: bundleId,
    status,
    step_results: stepResults,
    error,
  };

  if (includeScreenshot && screenshotRef) {
    payload.screenshot_ref = screenshotRef;
  }
  if (includeScreenshot && !screenshotRef && screenshot) {
    payload.screenshot = screenshot;
  }
  if (includeScreenshot && captureMeta) {
    payload.capture_meta = captureMeta;
  }
  if (includeSystemState && systemState) {
    payload.system_state = systemState;
  }

  return buildToolBundleResultEnvelope(payload);
}
