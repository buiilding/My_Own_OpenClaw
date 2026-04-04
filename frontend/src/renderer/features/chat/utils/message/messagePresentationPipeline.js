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

function normalizeInlineText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFirstNormalizedText(candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeInlineText(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function readWebSearchActionLike(message) {
  const candidates = [
    message?.toolOutputDetails?.metadata?.web_search_action,
    message?.toolOutputDetails?.metadata?.action,
    message?.toolOutputDetails?.action,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readWebSearchQueryFromAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return null;
  }
  const queries = Array.isArray(action.queries) ? action.queries : [];
  return readFirstNormalizedText([
    action.query,
    queries[0],
  ]);
}

function formatWebSearchCompletionText(action, fallbackQuery) {
  const actionType = normalizeInlineText(action?.type);
  if (actionType === 'open_page') {
    const url = normalizeInlineText(action?.url);
    if (url) {
      return url;
    }
  }
  if (actionType === 'find_in_page') {
    const pattern = normalizeInlineText(action?.pattern);
    const url = normalizeInlineText(action?.url);
    if (pattern && url) {
      return `'${pattern}' in ${url}`;
    }
    if (pattern) {
      return `'${pattern}'`;
    }
    if (url) {
      return url;
    }
  }

  const resolvedQuery = readFirstNormalizedText([
    readWebSearchQueryFromAction(action),
    fallbackQuery,
  ]);
  if (resolvedQuery) {
    return `Searched web for ${resolvedQuery}`;
  }
  return 'Searched the web';
}

function readMessageCorrelationId(message) {
  return readFirstNormalizedText([
    message?.correlationId,
    message?.toolCallDetails?.correlation_id,
    message?.toolCallDetails?.request_id,
    message?.toolOutputDetails?.request_id,
    message?.toolOutputDetails?.metadata?.request_id,
  ]);
}

function readToolName(message) {
  return readFirstNormalizedText([
    message?.toolName,
    message?.modelFacingToolCall?.name,
    message?.toolCallDetails?.tool_name,
    message?.toolOutputDetails?.tool_name,
  ]);
}

function isWebSearchToolMessage(message) {
  return readToolName(message) === 'web_search';
}

function readWebSearchQueryFromMessage(message) {
  return readFirstNormalizedText([
    message?.modelFacingToolCall?.arguments?.query,
    message?.toolCallDetails?.parameters?.query,
    message?.toolOutputDetails?.metadata?.web_search_query,
    message?.toolOutputDetails?.metadata?.query,
    readWebSearchQueryFromAction(readWebSearchActionLike(message)),
  ]);
}

function buildWebSearchRenderContext(messages, lowerBound) {
  const queryByCorrelationId = new Map();
  const completionTextByCorrelationId = new Map();

  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant' || message?.type !== 'tool-call' || !isWebSearchToolMessage(message)) {
      continue;
    }
    const correlationId = readMessageCorrelationId(message);
    const query = readWebSearchQueryFromMessage(message);
    if (correlationId && query) {
      queryByCorrelationId.set(correlationId, query);
    }
  }

  for (let index = lowerBound; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.sender !== 'assistant' || message?.type !== 'tool-output' || !isWebSearchToolMessage(message)) {
      continue;
    }
    const correlationId = readMessageCorrelationId(message);
    if (!correlationId) {
      continue;
    }
    const fallbackQuery = readFirstNormalizedText([
      readWebSearchQueryFromMessage(message),
      queryByCorrelationId.get(correlationId),
    ]);
    completionTextByCorrelationId.set(
      correlationId,
      formatWebSearchCompletionText(readWebSearchActionLike(message), fallbackQuery),
    );
  }

  return {
    completionTextByCorrelationId,
    queryByCorrelationId,
  };
}

function collectDerivedToolTexts(message, webSearchContext) {
  if (message?.type === 'tool-call') {
    if (isWebSearchToolMessage(message)) {
      const correlationId = readMessageCorrelationId(message);
      if (
        correlationId
        && webSearchContext.completionTextByCorrelationId.has(correlationId)
      ) {
        return [];
      }
      return ['Searching the web'];
    }
    return collectToolExplanationTexts(message);
  }

  if (message?.type === 'tool-output' && isWebSearchToolMessage(message)) {
    const correlationId = readMessageCorrelationId(message);
    if (correlationId) {
      const completionText = webSearchContext.completionTextByCorrelationId.get(correlationId);
      return completionText ? [completionText] : [];
    }
    return [
      formatWebSearchCompletionText(
        readWebSearchActionLike(message),
        readWebSearchQueryFromMessage(message),
      ),
    ];
  }

  return [];
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

function queueToolMessageEntries(entries, message, webSearchContext) {
  const explanationEntries = collectDerivedToolTexts(message, webSearchContext);
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
  const webSearchContext = buildWebSearchRenderContext(messages, lowerBound);
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

    queueToolMessageEntries(entries, message, webSearchContext);
  }

  return entries;
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
  const webSearchContext = buildWebSearchRenderContext(messages, activeSegmentLowerBound);
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

    if (message?.type === 'tool-call' || message?.type === 'tool-output') {
      const explanations = collectDerivedToolTexts(message, webSearchContext);
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
