"use strict";
/**
 * Provides the model selection module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildModelSettingsPatch = buildModelSettingsPatch;
function coerceNonEmptyString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}
function buildModelSettingsPatch(selection, owner = 'agent.setModel') {
    const modelId = coerceNonEmptyString(selection.modelId);
    const modelProvider = coerceNonEmptyString(selection.modelProvider);
    if (!modelId) {
        throw new Error(`${owner} requires a non-empty modelId`);
    }
    if (!modelProvider) {
        throw new Error(`${owner} requires a non-empty modelProvider`);
    }
    const patch = {
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
