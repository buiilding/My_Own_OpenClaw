/**
 * Provides the use response overlay view model module for the renderer UI.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCurrentTurnPresentationState } from '../../chat/hooks/useCurrentTurnPresentationState';
import { DesktopResponseOverlayRuntimeClient } from '../../../app/runtime/desktopResponseOverlayRuntimeClient';
import {
  buildResponseOverlayDismissalKey,
  useChatStore,
} from '../../chat/stores/chatStore';
import {
  resolveLiveTurnPresentationInput,
  resolveSdkOverlayIntent,
} from '../../../app/runtime/desktopLiveTurnSurfaceRuntime';
import { resolveSdkCurrentTurnPresentationState } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import {
  buildCurrentTurnMessagesFromProjection,
  buildCurrentTurnMessagesFromPresentation,
  isResponseCloseable,
  isResponseOverlayProgressMessage,
  isResponseOverlaySourceTaggedMessage,
  isVisibleResponseOverlayMessage,
  normalizeThinkingText,
} from '../../../app/runtime/desktopCurrentTurnMessageRuntime';
import { resolveChatPillViewIntent } from '../../../app/runtime/desktopChatPillSessionRuntime';
import { logRendererLiveSurfaceTrace } from '../../../app/runtime/desktopRendererTraceRuntime';

function normalizeProjectedCurrentTurnEntries(currentTurnProjection) {
  return buildCurrentTurnMessagesFromProjection(currentTurnProjection)
    .filter(isVisibleResponseOverlayMessage);
}

export function useResponseOverlayViewModel({
  messages = [],
  isSending = false,
  thinkingStatus,
  currentTurnProjection = null,
  pendingTurn = null,
}) {
  const dismissedResponseOverlayEntries = useChatStore(
    (state) => state.dismissedResponseOverlayEntries,
  );
  const dismissResponseOverlayEntry = useChatStore(
    (state) => state.dismissResponseOverlayEntry,
  );
  const lastResolvedTraceSignatureRef = useRef(null);
  const lastTypingVisibleRef = useRef(null);
  const lastOverlayIntentModeRef = useRef(null);
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    pendingTurn,
    isSending,
    messages,
  });
  const useSdkLiveTurnPresentation = liveTurnPresentationInput.useSdkLiveTurnPresentation;
  const useLocalSendLatch = liveTurnPresentationInput.useLocalSendLatch;
  const currentTurnPhase = liveTurnPresentationInput.phase;
  const currentTurnIsSending = liveTurnPresentationInput.isSending;

  const responseOverlayEntries = useMemo(
    () => {
      if (useLocalSendLatch) {
        return [];
      }
      if (useSdkLiveTurnPresentation) {
        return buildCurrentTurnMessagesFromPresentation(currentTurnProjection)
          .filter(isVisibleResponseOverlayMessage);
      }
      return normalizeProjectedCurrentTurnEntries(currentTurnProjection);
    },
    [currentTurnProjection, useLocalSendLatch, useSdkLiveTurnPresentation],
  );

  const currentTurnMessages = useMemo(
    () => (
      useLocalSendLatch
        ? messages
        : responseOverlayEntries
    ),
    [messages, responseOverlayEntries, useLocalSendLatch],
  );

  const responseOverlayDismissalTarget = useMemo(() => {
    if (responseOverlayEntries.length === 0) {
      return null;
    }
    const latestEntry = responseOverlayEntries[responseOverlayEntries.length - 1];
    if (!latestEntry?.id) {
      return null;
    }
    const sdkOverlayIntent = useSdkLiveTurnPresentation
      ? resolveSdkOverlayIntent(currentTurnProjection?.presentation, currentTurnProjection)
      : null;
    const turnRef = (
      sdkOverlayIntent?.turnRef
      || latestEntry.turnRef
      || currentTurnProjection?.turnRef
      || null
    );
    const conversationRef = (
      sdkOverlayIntent?.conversationRef
      || currentTurnProjection?.conversationRef
      || null
    );
    const guardRef = (
      sdkOverlayIntent?.staleGuardRef
      || sdkOverlayIntent?.turnRef
      || turnRef
      || null
    );
    return {
      conversationRef,
      turnRef,
      guardRef,
      responseEntryId: latestEntry.id,
    };
  }, [
    currentTurnProjection,
    responseOverlayEntries,
    useSdkLiveTurnPresentation,
  ]);

  const dismissedResponseId = useMemo(() => {
    const dismissalKey = buildResponseOverlayDismissalKey(responseOverlayDismissalTarget || {});
    if (!dismissalKey || !dismissedResponseOverlayEntries[dismissalKey]) {
      return null;
    }
    return responseOverlayDismissalTarget.responseEntryId;
  }, [
    dismissedResponseOverlayEntries,
    responseOverlayDismissalTarget,
  ]);

  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: currentTurnPhase,
    isSending: currentTurnIsSending,
    messages: currentTurnMessages,
    dismissedResponseId,
  });

  const resolvedCurrentTurnPresentationState = useMemo(
    () => {
      if (useSdkLiveTurnPresentation && !useLocalSendLatch) {
        return resolveSdkCurrentTurnPresentationState({
          currentTurnProjection,
          responseOverlayEntries,
          dismissedResponseId,
          includeOverlayIntent: true,
        });
      }
      if (useLocalSendLatch) {
        return {
          ...currentTurnPresentationState,
          overlayIntent: liveTurnPresentationInput.overlayIntent,
        };
      }
      return currentTurnPresentationState;
    },
    [
      currentTurnPresentationState,
      currentTurnProjection,
      dismissedResponseId,
      liveTurnPresentationInput.overlayIntent,
      responseOverlayEntries,
      useLocalSendLatch,
      useSdkLiveTurnPresentation,
    ],
  );

  const viewIntent = useMemo(() => resolveChatPillViewIntent({
    messages: currentTurnMessages,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    responseOverlayEntries,
    dismissedResponseId,
  }), [
    currentTurnMessages,
    dismissedResponseId,
    responseOverlayEntries,
    resolvedCurrentTurnPresentationState,
  ]);

  const latestSourceTaggedResponseEntry = useMemo(() => {
    for (let index = responseOverlayEntries.length - 1; index >= 0; index -= 1) {
      const entry = responseOverlayEntries[index];
      if (isResponseOverlaySourceTaggedMessage(entry)) {
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
    if (resolvedCurrentTurnPresentationState.isBusy) {
      return false;
    }
    return isResponseCloseable(latestSourceTaggedResponseEntry)
      || responseOverlayEntries.some(isResponseOverlayProgressMessage);
  }, [
    resolvedCurrentTurnPresentationState.isBusy,
    latestSourceTaggedResponseEntry,
    responseOverlayEntries,
    viewIntent.showResponse,
  ]);

  const thinkingText = useMemo(
    () => normalizeThinkingText(
      currentTurnProjection?.reasoningText ?? thinkingStatus,
    ),
    [currentTurnProjection?.reasoningText, thinkingStatus],
  );

  useEffect(() => {
    const overlayIntent = resolvedCurrentTurnPresentationState.overlayIntent ?? null;
    const awaitingVisible = viewIntent.showAwaitingReply === true;
    const responseVisible = viewIntent.showResponse === true;
    const tracePayload = {
      source: 'renderer-overlay-view-model',
      turnRef: currentTurnProjection?.turnRef || null,
      conversationRef: currentTurnProjection?.conversationRef || overlayIntent?.conversationRef || null,
      phase: currentTurnProjection?.phase || currentTurnPhase,
      overlayMode: overlayIntent?.mode || null,
      guardRef: overlayIntent?.staleGuardRef || overlayIntent?.turnRef || currentTurnProjection?.turnRef || null,
      awaitingVisible,
      responseVisible,
      showAwaitingDot: resolvedCurrentTurnPresentationState.showAssistantAwaitingDot === true,
      hasVisibleReply: resolvedCurrentTurnPresentationState.hasVisibleReply === true,
      isBusy: resolvedCurrentTurnPresentationState.isBusy === true,
      overlayTurnLifecycle: resolvedCurrentTurnPresentationState.overlayTurnLifecycle || null,
      entryCount: responseOverlayEntries.length,
      visibleResponseId: viewIntent.visibleResponse?.id || null,
      latestEntryId: viewIntent.latestResponseOverlayEntryId || null,
      useSdkLiveTurnPresentation,
      useLocalSendLatch,
    };
    const signature = JSON.stringify(tracePayload);
    if (lastResolvedTraceSignatureRef.current !== signature) {
      lastResolvedTraceSignatureRef.current = signature;
      logRendererLiveSurfaceTrace(
        'renderer.overlay_view_model.resolved',
        tracePayload,
        tracePayload.conversationRef,
      );
    }
    if (lastTypingVisibleRef.current !== awaitingVisible) {
      lastTypingVisibleRef.current = awaitingVisible;
      logRendererLiveSurfaceTrace(
        awaitingVisible ? 'typing.show' : 'typing.hide',
        {
          ...tracePayload,
          reason: awaitingVisible
            ? (useSdkLiveTurnPresentation ? 'sdk-awaiting' : 'preflight-awaiting')
            : (responseVisible ? 'response-visible' : 'not-awaiting'),
        },
        tracePayload.conversationRef,
      );
    }
    const nextOverlayIntentMode = awaitingVisible
      ? 'awaiting'
      : (responseVisible ? 'response' : 'hidden');
    if (lastOverlayIntentModeRef.current !== nextOverlayIntentMode) {
      lastOverlayIntentModeRef.current = nextOverlayIntentMode;
      const nextOverlayIntentEvent = nextOverlayIntentMode === 'awaiting'
        ? 'response_overlay.intent.show_awaiting'
        : (nextOverlayIntentMode === 'response'
          ? 'response_overlay.intent.show_response'
          : 'response_overlay.intent.hide');
      logRendererLiveSurfaceTrace(
        nextOverlayIntentEvent,
        {
          ...tracePayload,
          reason: nextOverlayIntentMode === 'awaiting'
            ? 'renderer-view-model-awaiting'
            : (nextOverlayIntentMode === 'response'
              ? 'renderer-view-model-response'
              : 'renderer-view-model-hidden'),
        },
        tracePayload.conversationRef,
      );
    }
  }, [
    currentTurnPhase,
    currentTurnProjection?.conversationRef,
    currentTurnProjection?.phase,
    currentTurnProjection?.turnRef,
    responseOverlayEntries.length,
    resolvedCurrentTurnPresentationState,
    useLocalSendLatch,
    useSdkLiveTurnPresentation,
    viewIntent,
  ]);

  const handleCloseResponse = useCallback(() => {
    if (
      !viewIntent.latestResponseOverlayEntryId
      || !responseIsCloseable
      || !responseOverlayDismissalTarget
    ) {
      return;
    }
    const dismissalTarget = {
      ...responseOverlayDismissalTarget,
      responseEntryId: viewIntent.latestResponseOverlayEntryId,
    };
    dismissResponseOverlayEntry(dismissalTarget);
    DesktopResponseOverlayRuntimeClient.setResponseboxSizeValues({
      visible: false,
      width: 0,
      height: 0,
      turnRef: dismissalTarget.turnRef,
      staleGuardRef: dismissalTarget.guardRef || dismissalTarget.turnRef,
      dismissed: true,
    }).catch((error) => {
      console.warn('[MinimalResponseOverlay] Failed to dismiss response overlay:', error);
    });
  }, [
    dismissResponseOverlayEntry,
    responseIsCloseable,
    responseOverlayDismissalTarget,
    viewIntent.latestResponseOverlayEntryId,
  ]);

  return {
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    overlayIntent: resolvedCurrentTurnPresentationState.overlayIntent ?? null,
    responseOverlayEntries,
    latestSourceTaggedResponseEntry,
    responseEntrySignature,
    responseIsCloseable,
    thinkingText,
    handleCloseResponse,
    ...viewIntent,
  };
}
