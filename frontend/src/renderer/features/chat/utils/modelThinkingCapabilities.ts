type ModelCapabilityDescriptor = {
  id?: string;
  provider?: string;
  supports_thinking?: boolean;
  supports_thinking_text_stream?: boolean;
};

export function resolveThinkingCapabilities(
  modelId: string | null | undefined,
  modelProvider: string | null | undefined,
  availableModels: { local?: unknown[]; online?: unknown[] } | null | undefined,
): { supportsThinking: boolean; supportsThinkingTextStream: boolean } {
  const normalizedModelId = typeof modelId === 'string' ? modelId : '';
  const normalizedProvider = typeof modelProvider === 'string' ? modelProvider : '';
  const localModels = Array.isArray(availableModels?.local) ? availableModels.local : [];
  const onlineModels = Array.isArray(availableModels?.online) ? availableModels.online : [];
  const allModels = [...localModels, ...onlineModels] as ModelCapabilityDescriptor[];
  const selectedModel = allModels.find(
    (model) => model?.id === normalizedModelId && model?.provider === normalizedProvider,
  ) || allModels.find((model) => model?.id === normalizedModelId);

  const inferredGeminiThinkingModel = (
    normalizedProvider === 'gemini'
    && normalizedModelId.toLowerCase().startsWith('gemini-')
  );
  const supportsThinking = typeof selectedModel?.supports_thinking === 'boolean'
    ? selectedModel.supports_thinking
    : inferredGeminiThinkingModel;

  const supportsThinkingTextStream = (
    typeof selectedModel?.supports_thinking_text_stream === 'boolean'
      ? selectedModel.supports_thinking_text_stream
      : supportsThinking
  );

  return {
    supportsThinking,
    supportsThinkingTextStream: supportsThinking ? supportsThinkingTextStream : false,
  };
}
