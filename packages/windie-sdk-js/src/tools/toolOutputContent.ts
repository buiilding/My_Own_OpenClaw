import type { JsonRecord } from '../conversation/types.js';

export type ToolOutputContent = {
  displayContent: string;
  modelContent: string;
  hasModelContent: boolean;
};

const DISPLAY_FALLBACK_KEYS = ['return_display', 'output', 'message'] as const;
const MODEL_FALLBACK_KEYS = ['llm_content', 'output', 'message'] as const;

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

function fallbackText(payload: JsonRecord): string {
  return stringField(payload, 'text', 'content', 'finalResponse', 'final_response', 'error') ?? '';
}

function jsonFallback(payload: JsonRecord): string {
  return fallbackText(payload) || JSON.stringify(payload);
}

export function readToolOutputContent(payload: JsonRecord): ToolOutputContent {
  const result = resultRecord(payload);
  const canonicalDisplay = stringField(payload, 'display_content')
    ?? stringField(result, 'display_content');
  const canonicalModel = stringField(payload, 'model_llm_content')
    ?? stringField(result, 'model_llm_content');
  const fallbackDisplay = stringField(payload, ...DISPLAY_FALLBACK_KEYS)
    ?? stringField(result, ...DISPLAY_FALLBACK_KEYS)
    ?? stringField(payload, 'llm_content')
    ?? stringField(result, 'llm_content')
    ?? fallbackText(payload);
  const fallbackModel = stringField(payload, ...MODEL_FALLBACK_KEYS)
    ?? stringField(result, ...MODEL_FALLBACK_KEYS)
    ?? fallbackText(payload);
  const modelContent = canonicalModel ?? fallbackModel ?? jsonFallback(payload);
  return {
    displayContent: canonicalDisplay ?? fallbackDisplay ?? modelContent,
    modelContent,
    hasModelContent: Boolean(canonicalModel ?? fallbackModel),
  };
}

export function normalizeLocalToolResultData(data: JsonRecord | undefined): JsonRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }
  const displayContent = stringField(data, 'display_content')
    ?? stringField(data, ...DISPLAY_FALLBACK_KEYS)
    ?? stringField(data, 'llm_content')
    ?? JSON.stringify(data);
  const llmContent = stringField(data, 'llm_content') ?? displayContent;
  return {
    ...data,
    display_content: displayContent,
    llm_content: llmContent,
  };
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
