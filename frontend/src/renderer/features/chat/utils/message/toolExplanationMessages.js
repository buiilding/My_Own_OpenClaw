function normalizeExplanationText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readExplanationFromArguments(argumentsLike) {
  if (!argumentsLike || typeof argumentsLike !== 'object' || Array.isArray(argumentsLike)) {
    return null;
  }
  const explanationCandidates = [
    argumentsLike.explanation,
    argumentsLike?.metadata?.explanation,
    argumentsLike?.arguments?.explanation,
    argumentsLike?.arguments?.metadata?.explanation,
  ];
  for (const explanation of explanationCandidates) {
    const normalizedExplanation = normalizeExplanationText(explanation);
    if (normalizedExplanation) {
      return normalizedExplanation;
    }
  }
  return null;
}

export function collectToolExplanationTexts(message) {
  const explanations = [];
  const seen = new Set();
  const pushExplanation = (value) => {
    const normalizedExplanation = normalizeExplanationText(value);
    if (!normalizedExplanation || seen.has(normalizedExplanation)) {
      return;
    }
    seen.add(normalizedExplanation);
    explanations.push(normalizedExplanation);
  };

  pushExplanation(readExplanationFromArguments(message?.modelFacingToolCall?.arguments));
  pushExplanation(readExplanationFromArguments(message?.toolCallDetails?.parameters));

  const bundledTools = Array.isArray(message?.toolCallDetails?.tools)
    ? message.toolCallDetails.tools
    : [];
  bundledTools.forEach((tool) => {
    pushExplanation(readExplanationFromArguments(tool?.metadata?.model_facing_tool_call?.arguments));
    pushExplanation(readExplanationFromArguments(tool?.args));
  });

  return explanations;
}
