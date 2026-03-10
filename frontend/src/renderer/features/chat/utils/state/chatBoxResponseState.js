import { resolveSourceTag } from '../message/sourceTags';

function findLastUserIndex(messages) {
  if (!Array.isArray(messages)) {
    return -1;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.sender === 'user') {
      return index;
    }
  }
  return -1;
}

function normalizeEntryText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().length > 0 ? value : null;
}

function readExplanationFromArguments(argumentsLike) {
  const explanation = argumentsLike?.explanation;
  if (typeof explanation !== 'string') {
    return null;
  }
  const normalizedExplanation = explanation.trim();
  return normalizedExplanation.length > 0 ? normalizedExplanation : null;
}

function collectToolExplanationTexts(message) {
  const explanations = [];
  const seen = new Set();
  const pushExplanation = (value) => {
    const normalizedExplanation = typeof value === 'string' ? value.trim() : '';
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

export function isResponseCloseable(response) {
  if (!response) {
    return false;
  }
  if (response.type === 'error') {
    return true;
  }
  return Boolean(response.isComplete);
}

export function normalizeThinkingText(thinkingStatus) {
  return typeof thinkingStatus === 'string' ? thinkingStatus.trim() : '';
}

export function buildCurrentTurnResponseOverlayEntries(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  const entries = [];

  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant') {
      continue;
    }

    if (message.type === 'llm-text' || message.type === 'error') {
      const entryText = normalizeEntryText(message.text);
      if (!entryText) {
        continue;
      }
      entries.push({
        id: message.id,
        type: message.type,
        text: message.text,
        sourceEventType: message.sourceEventType || null,
        sourceChannel: message.sourceChannel || null,
        modelId: message.modelId || null,
        modelProvider: message.modelProvider || null,
        isComplete: message.isComplete === true,
      });
      continue;
    }

    if (message.type === 'tool-call') {
      const explanationEntries = collectToolExplanationTexts(message);
      explanationEntries.forEach((explanation, explanationIndex) => {
        entries.push({
          id: `${message.id}:tool-explanation:${explanationIndex}`,
          type: 'tool-explanation',
          text: explanation,
          sourceEventType: message.sourceEventType || null,
          sourceChannel: message.sourceChannel || null,
        });
      });
    }
  }

  return entries;
}

export function shouldRenderResponseMarkdown(response) {
  return Boolean(response && response.type === 'llm-text');
}

export function resolveSourceTagForResponse({
  visibleResponse,
  showResponse,
  devUiEnabled,
}) {
  if (!devUiEnabled || !visibleResponse || !showResponse) {
    return null;
  }
  const sourceEventType = (
    typeof visibleResponse.sourceEventType === 'string' && visibleResponse.sourceEventType
      ? visibleResponse.sourceEventType
      : 'unknown'
  );
  const sourceChannel = (
    typeof visibleResponse.sourceChannel === 'string' && visibleResponse.sourceChannel
      ? visibleResponse.sourceChannel
      : 'unknown'
  );
  return resolveSourceTag(sourceEventType, sourceChannel);
}
