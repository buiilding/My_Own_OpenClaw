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

function hasIncompleteAssistantReplyAfterIndex(messages, lowerBound) {
  if (!Array.isArray(messages)) {
    return false;
  }
  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant') {
      continue;
    }
    if (message?.type === 'tool-call' || message?.type === 'tool-output') {
      continue;
    }
    if (!normalizeText(message?.text)) {
      continue;
    }
    if (message.isComplete === true) {
      continue;
    }
    return true;
  }
  return false;
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

function buildToolActionsSummaryMessage(pendingSummary, summaryIndex) {
  if (!pendingSummary || pendingSummary.explanations.length === 0) {
    return null;
  }
  const totalActions = pendingSummary.explanations.length;
  return {
    id: `${pendingSummary.anchorId || 'tool-actions'}:summary:${summaryIndex}`,
    text: `${totalActions} action${totalActions === 1 ? '' : 's'}`,
    sender: 'assistant',
    type: 'tool-actions-summary',
    sourceEventType: pendingSummary.sourceEventType || 'tool-call',
    sourceChannel: pendingSummary.sourceChannel || 'derived',
    turnRef: pendingSummary.turnRef,
    modelId: pendingSummary.modelId || null,
    modelProvider: pendingSummary.modelProvider || null,
    actionExplanations: [...pendingSummary.explanations],
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
      message?.type === 'tool-explanation'
      || message?.type === 'search-source'
    ) {
      return true;
    }
    if (
      message?.type === 'tool-call'
      && collectToolExplanationTexts(message).length > 0
    ) {
      return true;
    }
  }

  return false;
}

export function buildThreadPresentationMessages(
  messages,
  { showToolLogs = true, isBusy = false } = {},
) {
  if (!Array.isArray(messages) || messages.length === 0 || showToolLogs) {
    return Array.isArray(messages) ? messages : [];
  }

  const renderedMessages = [];
  const activeSegmentLowerBound = (() => {
    const lastUserIndex = findLastUserIndex(messages);
    return lastUserIndex >= 0 ? lastUserIndex + 1 : 0;
  })();
  const keepActiveSegmentExpanded = (
    isBusy
    || hasIncompleteAssistantReplyAfterIndex(messages, activeSegmentLowerBound)
  );
  let pendingSummary = null;
  let summaryIndex = 0;

  const flushPendingSummary = () => {
    const summaryMessage = buildToolActionsSummaryMessage(pendingSummary, summaryIndex);
    pendingSummary = null;
    if (!summaryMessage) {
      return;
    }
    summaryIndex += 1;
    renderedMessages.push(summaryMessage);
  };

  const queueCompletedExplanation = (message, explanation) => {
    if (!pendingSummary) {
      pendingSummary = {
        anchorId: message.id,
        sourceEventType: message.sourceEventType || null,
        sourceChannel: message.sourceChannel || null,
        turnRef: message.turnRef,
        modelId: message.modelId || null,
        modelProvider: message.modelProvider || null,
        explanations: [],
      };
    }
    pendingSummary.explanations.push(explanation);
  };

  messages.forEach((message, index) => {
    if (message?.sender === 'user') {
      flushPendingSummary();
      renderedMessages.push(message);
      return;
    }

    if (message?.type === 'tool-output') {
      return;
    }

    if (message?.type === 'search-source') {
      flushPendingSummary();
      renderedMessages.push(message);
      return;
    }

    if (message?.type === 'tool-call') {
      const explanations = collectToolExplanationTexts(message);
      if (explanations.length === 0) {
        return;
      }

      const isActiveSegmentMessage = keepActiveSegmentExpanded && index >= activeSegmentLowerBound;
      if (isActiveSegmentMessage) {
        explanations.forEach((explanation, explanationIndex) => {
          renderedMessages.push(buildToolExplanationMessage(message, explanation, explanationIndex));
        });
        return;
      }

      explanations.forEach((explanation) => {
        queueCompletedExplanation(message, explanation);
      });
      return;
    }

    flushPendingSummary();
    renderedMessages.push(message);
  });

  flushPendingSummary();
  return renderedMessages;
}
