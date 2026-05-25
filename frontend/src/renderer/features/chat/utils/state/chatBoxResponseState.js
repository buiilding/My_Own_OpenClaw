import { resolveSourceTag } from '../message/sourceTags';
import { buildCurrentTurnResponseOverlayEntries as buildCurrentTurnResponseOverlayEntriesFromPipeline } from '../message/messagePresentationPipeline';

export function buildCurrentTurnResponseOverlayEntries(messages) {
  return buildCurrentTurnResponseOverlayEntriesFromPipeline(messages);
}

export function buildCurrentTurnMessagesFromProjection(currentTurnProjection) {
  if (!currentTurnProjection || typeof currentTurnProjection !== 'object') {
    return [];
  }
  const {
    conversationRef,
    turnRef,
    phase,
    assistantText,
    reasoningText,
    toolEvents,
    lastError,
  } = currentTurnProjection;
  const hasText = typeof assistantText === 'string' && assistantText.trim();
  const hasReasoning = typeof reasoningText === 'string' && reasoningText.trim();
  const hasError = typeof lastError === 'string' && lastError.trim();
  const hasToolEvents = Array.isArray(toolEvents) && toolEvents.length > 0;
  if (phase === 'idle' && !hasText && !hasReasoning && !hasError && !hasToolEvents) {
    return [];
  }

  const baseId = `${conversationRef || 'conversation'}:${turnRef || 'turn'}`;
  const messages = [{
    id: `${baseId}:user-marker`,
    text: '',
    sender: 'user',
    turnRef: turnRef || undefined,
    sourceEventType: 'sdk-current-turn',
    sourceChannel: 'conversation-runtime-updated',
  }];

  if (hasReasoning && !hasText) {
    messages.push({
      id: `${baseId}:thinking`,
      text: '',
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: reasoningText,
      sourceEventType: 'reasoning_delta',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: false,
    });
  }

  if (hasToolEvents) {
    toolEvents.forEach((toolEvent, index) => {
      const text = typeof toolEvent?.text === 'string' && toolEvent.text.trim()
        ? toolEvent.text
        : (typeof toolEvent?.toolName === 'string' ? toolEvent.toolName : '');
      if (!text) {
        return;
      }
      messages.push({
        id: `${baseId}:tool:${toolEvent.id || index}`,
        text,
        sender: 'assistant',
        type: toolEvent.kind === 'tool_progress' ? 'search-source' : 'tool-call',
        sourceEventType: toolEvent.kind,
        sourceChannel: 'conversation-runtime-updated',
        turnRef: turnRef || undefined,
        toolName: toolEvent.toolName || undefined,
        success: toolEvent.status === 'success' ? true : undefined,
        actionExplanations: toolEvent.kind === 'tool_progress' ? null : [text],
        toolCallDetails: {
          parameters: {
            explanation: text,
          },
        },
        toolMetadata: toolEvent.payload || null,
      });
    });
  }

  if (hasText) {
    messages.push({
      id: `${baseId}:assistant`,
      text: assistantText,
      sender: 'assistant',
      type: 'llm-text',
      thinkingText: hasReasoning ? reasoningText : null,
      sourceEventType: 'assistant_delta',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: phase === 'complete',
    });
  }

  if (hasError) {
    messages.push({
      id: `${baseId}:error`,
      text: lastError,
      sender: 'assistant',
      type: 'error',
      sourceEventType: 'runtime_error',
      sourceChannel: 'conversation-runtime-updated',
      turnRef: turnRef || undefined,
      isComplete: true,
    });
  }

  return messages;
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
