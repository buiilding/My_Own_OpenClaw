/**
 * Provides the use chat surface controller module for the renderer UI.
 */

import { useCallback } from 'react';
import { useAppConfigContext } from '../../../app/providers/AppConfigContext';
import { runManualCompaction as runManualCompactionCommand } from '../utils/session/manualCompactionRuntime';
import { useCurrentTurnPresentationState } from './useCurrentTurnPresentationState';
import { resolveLiveTurnPresentationInput } from '../utils/state/liveTurnSurfaceState';

function hasSdkLiveTurnPresentation(currentTurnProjection) {
  const presentation = currentTurnProjection?.presentation;
  return Boolean(
    presentation
      && typeof presentation === 'object'
      && typeof presentation.typingVisible === 'boolean'
      && typeof presentation.overlayVisible === 'boolean',
  );
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function resolveSdkOverlayIntentMode(presentation) {
  const mode = presentation?.overlayIntent?.mode;
  if (mode === 'awaiting' || mode === 'response' || mode === 'hidden') {
    return mode;
  }
  if (presentation?.overlayVisible === true) {
    return 'response';
  }
  if (presentation?.typingVisible === true) {
    return 'awaiting';
  }
  return 'hidden';
}

function resolveSdkAwaitingDotTargetMessageId(presentation, fallbackState) {
  if (!presentation || !hasOwn(presentation, 'awaitingAnchor')) {
    return fallbackState?.awaitingDotTargetMessageId ?? null;
  }
  const anchor = presentation.awaitingAnchor;
  if (
    anchor
    && anchor.kind === 'user-message'
    && typeof anchor.rowId === 'string'
    && anchor.rowId.trim()
  ) {
    return anchor.rowId;
  }
  return null;
}

function buildSdkCurrentTurnPresentationState(currentTurnProjection, fallbackState) {
  const presentation = currentTurnProjection?.presentation;
  if (!presentation) {
    return null;
  }
  const overlayIntentMode = resolveSdkOverlayIntentMode(presentation);
  const awaitingVisible = overlayIntentMode === 'awaiting';
  const responseVisible = overlayIntentMode === 'response';
  return {
    activeResponse: null,
    hasVisibleReply: presentation.hasVisibleContent === true,
    loopUiState: responseVisible ? 'active-response' : (awaitingVisible ? 'awaiting-reply' : 'idle'),
    isBusy: presentation.isBusy === true,
    isAwaitingReply: awaitingVisible,
    showAssistantAwaitingDot: awaitingVisible,
    awaitingDotTargetMessageId: awaitingVisible
      ? resolveSdkAwaitingDotTargetMessageId(presentation, fallbackState)
      : null,
    visibleResponse: null,
    chatboxSurfaceState: responseVisible ? 'response' : (awaitingVisible ? 'awaiting-reply' : 'compact'),
    showChatboxAwaitingReply: awaitingVisible,
    showChatboxResponse: responseVisible,
    isTransportConnected: true,
    overlayTurnLifecycle: awaitingVisible
      ? 'awaiting'
      : (responseVisible && presentation.isBusy ? 'active' : (presentation.isTerminal ? 'terminal' : 'idle')),
  };
}

function applyBooleanConfigUpdate(updateConfig, key, nextValue) {
  if (typeof updateConfig !== 'function') {
    return false;
  }
  updateConfig({
    [key]: nextValue,
  });
  return true;
}

export function useChatSurfaceController({
  isSending,
  messages,
  currentTurnProjection = null,
  allowedTypes,
  sessionInfo,
  setThinkingStatus,
  setThinkingSourceEventType,
  allowManualCompactionWhileBusy = false,
  warningContext = 'ChatSurface',
}) {
  const { config, updateConfig } = useAppConfigContext();
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    isSending,
    messages,
  });
  const currentTurnPresentationState = useCurrentTurnPresentationState({
    phase: liveTurnPresentationInput.phase,
    isSending: liveTurnPresentationInput.isSending,
    messages,
    allowedTypes,
  });
  const resolvedCurrentTurnPresentationState = hasSdkLiveTurnPresentation(currentTurnProjection)
    ? buildSdkCurrentTurnPresentationState(currentTurnProjection, currentTurnPresentationState)
    : currentTurnPresentationState;
  const isBusy = resolvedCurrentTurnPresentationState.isBusy === true;
  const speechModeEnabled = config?.speech_mode_enabled === true;
  const wakewordSttEnabled = config?.wakeword_stt_enabled === true;
  const includeQueryScreenshot = config?.include_query_screenshot ?? true;

  const toggleBooleanConfig = useCallback((key, nextValue) => {
    if (isBusy) {
      return false;
    }
    return applyBooleanConfigUpdate(updateConfig, key, nextValue);
  }, [isBusy, updateConfig]);

  const toggleSpeechMode = useCallback(() => {
    return toggleBooleanConfig('speech_mode_enabled', !speechModeEnabled);
  }, [speechModeEnabled, toggleBooleanConfig]);

  const toggleQueryScreenshot = useCallback(() => {
    return toggleBooleanConfig('include_query_screenshot', !includeQueryScreenshot);
  }, [includeQueryScreenshot, toggleBooleanConfig]);

  const runManualCompaction = useCallback(async () => {
    if (isBusy && !allowManualCompactionWhileBusy) {
      return false;
    }
    await runManualCompactionCommand({
      config,
      conversationRef: sessionInfo?.conversationRef || null,
      userId: sessionInfo?.userId || null,
      setThinkingStatus,
      setThinkingSourceEventType,
      warningContext,
    });
    return true;
  }, [
    allowManualCompactionWhileBusy,
    config,
    isBusy,
    sessionInfo?.conversationRef,
    sessionInfo?.userId,
    setThinkingSourceEventType,
    setThinkingStatus,
    warningContext,
  ]);

  return {
    config,
    currentTurnPresentationState: resolvedCurrentTurnPresentationState,
    includeQueryScreenshot,
    isBusy,
    canStop: isBusy,
    liveTurnPhase: liveTurnPresentationInput.phase,
    liveTurnSource: liveTurnPresentationInput.source,
    speechModeEnabled,
    toggleBooleanConfig,
    toggleQueryScreenshot,
    toggleSpeechMode,
    wakewordSttEnabled,
    runManualCompaction,
  };
}
