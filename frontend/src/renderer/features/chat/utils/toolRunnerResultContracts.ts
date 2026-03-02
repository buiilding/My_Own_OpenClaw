import {
  buildToolBundleResultEnvelope,
  buildToolResultEnvelope,
  resolveToolResultEnvelopeCorrelationId,
} from '../../../infrastructure/services/ToolResultEnvelope';

export const buildToolRunnerResultEnvelope = buildToolResultEnvelope;
export const buildToolRunnerBundleResultEnvelope = buildToolBundleResultEnvelope;
export const resolveToolRunnerEnvelopeCorrelationId = resolveToolResultEnvelopeCorrelationId;
