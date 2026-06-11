import { collectToolExplanationTexts } from './toolExplanationMessages';

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

function normalizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : null;
}

function buildToolExplanationMessage(message, explanation, explanationIndex) {
  return {
    id: `${message.id}:tool-explanation:${explanationIndex}`,
    text: explanation,
    sender: 'assistant',
    type: 'tool-explanation',
    sourceEventType: message.sourceEventType || null,
    sourceChannel: message.sourceChannel || null,
    turnRef: message.turnRef,
    modelId: message.modelId || null,
    modelProvider: message.modelProvider || null,
  };
}

function queueToolMessageEntries(entries, message) {
  if (message?.type === 'search-source') {
    const entryText = normalizeText(message.text);
    if (!entryText) {
      return;
    }
    entries.push({
      id: message.id,
      text: message.text,
      sender: 'assistant',
      type: 'search-source',
      sourceEventType: message.sourceEventType || null,
      sourceChannel: message.sourceChannel || null,
      turnRef: message.turnRef,
      modelId: message.modelId || null,
      modelProvider: message.modelProvider || null,
    });
    return;
  }

  if (message?.type !== 'tool-call') {
    return;
  }

  const explanationEntries = collectToolExplanationTexts(message);
  explanationEntries.forEach((explanation, explanationIndex) => {
    entries.push(buildToolExplanationMessage(message, explanation, explanationIndex));
  });
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
      const entryText = normalizeText(message.text);
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

    queueToolMessageEntries(entries, message);
  }

  return entries;
}

export function hasCurrentTurnLiveProgressMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }

  const lastUserIndex = findLastUserIndex(messages);
  const lowerBound = lastUserIndex >= 0 ? lastUserIndex + 1 : 0;

  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (
      message?.type === 'tool-output'
      || message?.type === 'tool-call'
      || message?.type === 'tool-bundle'
      || message?.type === 'tool-explanation'
      || message?.type === 'search-source'
    ) {
      return true;
    }
  }

  return false;
}

export function buildThreadPresentationMessages(
  messages,
) {
  return Array.isArray(messages) ? messages : [];
}
