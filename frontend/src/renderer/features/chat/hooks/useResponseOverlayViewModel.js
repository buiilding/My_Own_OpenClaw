import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCurrentTurnPresentationState } from './useCurrentTurnPresentationState';
import { resolveLlmOutputContract } from '../../../infrastructure/llmOutputContract';
import { toSanitizedMarkdownHtml } from '../../../infrastructure/markdown';
import { isDevUiEnabled } from '../utils/devUiFlag';
import { RESPONSE_OVERLAY_PHASE } from '../utils/overlay/responseOverlayPhaseContract';
import {
  buildCurrentTurnResponseOverlayEntries,
  isResponseCloseable,
  normalizeThinkingText,
  resolveSourceTagForResponse,
  shouldRenderResponseMarkdown,
} from '../utils/state/chatBoxResponseState';
import { resolveChatPillViewIntent } from '../utils/chatPill/chatPillSessionFlow';

export function useResponseOverlayViewModel({
  messages,
  isSending,
  thinkingStatus,
  overlayPhase,
}) {
  const [closedResponseId, setClosedResponseId] = useState(null);

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: overlayPhase,
    isSending,
    messages,
    dismissedResponseId: closedResponseId,
  });

  const responseOverlayEntries = useMemo(
    () => buildCurrentTurnResponseOverlayEntries(messages),
    [messages],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages,
    currentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId: closedResponseId,
  }), [
    closedResponseId,
    currentTurnPresentationState,
    messages,
    responseOverlayEntries,
  ]);

  const latestSourceTaggedResponseEntry = useMemo(() => {
    for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
      const entry = responseOverlayEntries[index];
      if (entry?.type === 'llm-text' || entry?.type === 'error') {
        return entry;
      }
    }
    return null;
  }, [responseOverlayEntries]);

  const responseEntrySignature = useMemo(
    () => responseOverlayEntries.map((entry) => `${entry.id}:${entry.text}`).join('\u0001'),
    [responseOverlayEntries],
  );

  const responseIsCloseable = useMemo(() => {
    if (!viewIntent.showResponse) {
      return false;
    }
    if (currentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some((entry) => entry.type === 'tool-explanation');
  }, [
    currentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    viewIntent.showResponse,
  ]);

  const renderedResponseEntries = useMemo(() => {
    return responseOverlayEntries.map((entry) => {
      if (!shouldRenderResponseMarkdown(entry)) {
        return {
          ...entry,
          markdownHtml: '',
        };
      }
      const contract = resolveLlmOutputContract(entry.text ?? '', {
        provider: entry.modelProvider || null,
        modelId: entry.modelId || null,
        enableMath: true,
        stripAccidentalHtmlTokens: true,
      });
      return {
        ...entry,
        markdownHtml: toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled }),
      };
    });
  }, [responseOverlayEntries]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(thinkingStatus),
    [thinkingStatus],
  );

  const sourceTagForResponse = useMemo(() => {
    return resolveSourceTagForResponse({
      visibleResponse: latestSourceTaggedResponseEntry,
      showResponse: viewIntent.showResponse,
      devUiEnabled: isDevUiEnabled(),
    });
  }, [latestSourceTaggedResponseEntry, viewIntent.showResponse]);

  useEffect(() => {
    if (overlayPhase === RESPONSE_OVERLAY_PHASE.AWAITING_FIRST_CHUNK) {
      setClosedResponseId(null);
    }
  }, [overlayPhase]);

  const handleCloseResponse = useCallback(() => {
    if (!viewIntent.latestResponseOverlayEntryId || !responseIsCloseable) {
      return;
    }
    setClosedResponseId(viewIntent.latestResponseOverlayEntryId);
  }, [responseIsCloseable, viewIntent.latestResponseOverlayEntryId]);

  return {
    currentTurnPresentationState,
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    renderedResponseEntries,
    thinkingText,
    sourceTagForResponse,
    handleCloseResponse,
    ...viewIntent,
  };
}
