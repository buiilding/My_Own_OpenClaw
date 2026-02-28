import {
  buildToolBundleResultEnvelope,
  buildToolResultEnvelope,
  resolveToolResultEnvelopeCorrelationId,
  TOOL_BUNDLE_RESULT_ENVELOPE_TYPE,
  TOOL_RESULT_ENVELOPE_TYPE,
} from '../../../infrastructure/services/ToolResultEnvelope';

export const TOOL_RUNNER_RESULT_TYPE = TOOL_RESULT_ENVELOPE_TYPE;
export const TOOL_RUNNER_BUNDLE_RESULT_TYPE = TOOL_BUNDLE_RESULT_ENVELOPE_TYPE;

export const buildToolRunnerResultEnvelope = buildToolResultEnvelope;
export const buildToolRunnerBundleResultEnvelope = buildToolBundleResultEnvelope;
export const resolveToolRunnerEnvelopeCorrelationId = resolveToolResultEnvelopeCorrelationId;
