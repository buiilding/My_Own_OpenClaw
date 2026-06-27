/**
 * Provides the tool output content module for the TypeScript SDK runtime.
 */

import type { JsonRecord } from '../conversation/types.js';

type ToolOutputContent = {
  displayContent: string;
  modelContent: string;
  hasModelContent: boolean;
};

const OUTPUT_FALLBACK_KEYS = ['output', 'message', 'error'] as const;

export function recordFromUnknown(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export function stringField(payload: JsonRecord | null | undefined, ...keys: string[]): string | null {
  if (!payload) {
    return null;
  }
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function resultRecord(payload: JsonRecord): JsonRecord | null {
  return recordFromUnknown(payload.result);
}

function jsonFallback(payload: JsonRecord): string {
  return JSON.stringify(payload);
}

export function readToolOutputContent(payload: JsonRecord): ToolOutputContent {
  const result = resultRecord(payload);
  const output = stringField(payload, ...OUTPUT_FALLBACK_KEYS)
    ?? stringField(result, ...OUTPUT_FALLBACK_KEYS);
  const modelContent = output ?? jsonFallback(payload);
  return {
    displayContent: modelContent,
    modelContent,
    hasModelContent: Boolean(output),
  };
}

export function normalizeLocalToolResultData(data: JsonRecord | undefined, fallbackOutput: unknown = ''): JsonRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { output: fallbackOutput };
  }
  const explicitOutput = data.output;
  const output = explicitOutput
    ?? data.message
    ?? data.error
    ?? fallbackOutput;
  const normalized: JsonRecord = { ...data };
  delete normalized.path_trace;
  normalized.output = output;
  return normalized;
}

export function readBundleStepModelContent(step: JsonRecord): string {
  const output = step.output ?? step.result;
  if (typeof output === 'string') {
    return output;
  }
  const outputRecord = recordFromUnknown(output);
  if (outputRecord) {
    return readToolOutputContent(outputRecord).modelContent;
  }
  return JSON.stringify(step);
}
