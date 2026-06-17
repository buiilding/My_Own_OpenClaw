/**
 * Provides the model selection module for the TypeScript SDK runtime.
 */

import type { JsonRecord } from '../conversation/types.js';

export type AgentModelSelection = {
  modelId: string;
  modelProvider?: string;
  modelMode?: string;
  interactionMode?: string;
};

function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildModelSettingsPatch(
  selection: AgentModelSelection,
  owner = 'agent.setModel',
): JsonRecord {
  const modelId = coerceNonEmptyString(selection.modelId);
  const modelProvider = coerceNonEmptyString(selection.modelProvider);
  if (!modelId) {
    throw new Error(`${owner} requires a non-empty modelId`);
  }
  if (!modelProvider) {
    throw new Error(`${owner} requires a non-empty modelProvider`);
  }

  const patch: JsonRecord = {
    selected_model_id: modelId,
    model_provider: modelProvider,
  };
  const modelMode = coerceNonEmptyString(selection.modelMode);
  if (modelMode) {
    patch.model_mode = modelMode;
  }
  const interactionMode = coerceNonEmptyString(selection.interactionMode);
  if (interactionMode) {
    patch.interaction_mode = interactionMode;
  }
  return patch;
}
