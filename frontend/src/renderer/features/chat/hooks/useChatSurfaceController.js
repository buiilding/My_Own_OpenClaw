/**
 * Provides the use chat surface controller module for the renderer UI.
 */

import { useCallback, useMemo } from 'react';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopManualCompactionRuntime } from '../../../app/runtime/desktopManualCompactionRuntime';
import { DesktopCurrentTurnPresentationRuntime } from '../../../app/runtime/desktopCurrentTurnPresentationRuntime';
import {
  DesktopLiveTurnSurfaceRuntime,
} from '../../../app/runtime/desktopLiveTurnSurfaceRuntime';
import { DesktopVisibleTurnLifecycleRuntime } from '../../../app/runtime/desktopVisibleTurnLifecycleRuntime';

const {
  applyVisibleTurnLifecycleToPresentationState,
  resolveVisibleTurnLifecycle,
} = DesktopVisibleTurnLifecycleRuntime;
const {
  resolveLiveTurnPresentationInput,
} = DesktopLiveTurnSurfaceRuntime;
const {
  resolveCurrentTurnPresentationState,
} = DesktopCurrentTurnPresentationRuntime;
const {
  runManualCompaction: runManualCompactionCommand,
} = DesktopManualCompactionRuntime;

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
  messages,
  currentTurnProjection = null,
  conversationView = null,
  conversationViewSurface = 'pill',
  pendingTurn = null,
  sessionInfo,
  setThinkingStatus,
  setThinkingSourceEventType,
  allowManualCompactionWhileBusy = false,
  warningContext = 'ChatSurface',
}) {
  const { config, updateConfig } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const visibleTurnLifecycle = resolveVisibleTurnLifecycle({
    activeConversationRef: (
      conversationView?.conversationRef
      || currentTurnProjection?.conversationRef
      || sessionInfo?.conversationRef
      || null
    ),
    pendingTurn,
    currentTurnProjection,
    conversationView,
    messages,
  });
  const liveTurnPresentationInput = resolveLiveTurnPresentationInput({
    currentTurnProjection,
    conversationView,
    pendingTurn,
    messages,
    visibleTurnLifecycle,
  });
  const currentTurnPresentationState = useMemo(
    () => resolveCurrentTurnPresentationState({ messages }),
    [messages],
  );
  const visibleLifecyclePresentationState = applyVisibleTurnLifecycleToPresentationState(
    currentTurnPresentationState,
    visibleTurnLifecycle,
  );
  const hasConversationView = Boolean(conversationView && typeof conversationView === 'object');
  const viewSurfaceMode = conversationView?.surfaces?.[conversationViewSurface]?.mode;
  const isLocalPending = liveTurnPresentationInput.useLocalPendingTurn === true;
  const isBusy = isLocalPending
    ? true
    : hasConversationView
      ? viewSurfaceMode === 'busy'
      : visibleTurnLifecycle.isBusy === true;
  const canStop = isLocalPending
    ? true
    : hasConversationView
      ? conversationView?.liveTurn?.canStop === true
      : false;
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
    currentTurnPresentationState: visibleLifecyclePresentationState,
    includeQueryScreenshot,
    isBusy,
    canStop,
    liveTurnPhase: liveTurnPresentationInput.phase,
    liveTurnSource: liveTurnPresentationInput.source,
    visibleTurnLifecycle,
    speechModeEnabled,
    toggleBooleanConfig,
    toggleQueryScreenshot,
    toggleSpeechMode,
    wakewordSttEnabled,
    runManualCompaction,
  };
}
