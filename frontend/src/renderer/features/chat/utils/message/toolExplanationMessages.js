function normalizeExplanationText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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
    if (typeof message?.text !== 'string' || message.text.trim().length === 0) {
      continue;
    }
    if (message.isComplete === true) {
      continue;
    }
    return true;
  }
  return false;
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

export function buildToolLogPresentationMessages(messages, { showToolLogs = true, isBusy = false } = {}) {
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
