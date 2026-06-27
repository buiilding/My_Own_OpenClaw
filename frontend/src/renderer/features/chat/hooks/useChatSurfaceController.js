/**
 * Provides the use chat surface controller module for the renderer UI.
 */

import { useCallback, useMemo } from 'react';
import { DesktopRendererConfigRuntimeClient } from '../../../app/runtime/desktopRendererConfigRuntimeClient';
import { DesktopManualCompactionRuntime } from '../../../app/runtime/desktopManualCompactionRuntime';
import {
  DesktopChatSurfaceRuntime,
} from '../../../app/runtime/desktopChatSurfaceRuntime';

const {
  runManualCompaction: runManualCompactionCommand,
} = DesktopManualCompactionRuntime;
const {
  buildChatSurfaceControllerStateFromSurfaceState,
} = DesktopChatSurfaceRuntime;

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
  chatSurfaceState = null,
  conversationViewSurface = 'pill',
  sessionInfo,
  setThinkingStatus,
  setThinkingSourceEventType,
  allowManualCompactionWhileBusy = false,
  warningContext = 'ChatSurface',
}) {
  const { config, updateConfig } = DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext();
  const surfaceState = useMemo(
    () => buildChatSurfaceControllerStateFromSurfaceState({
      chatSurfaceState,
      conversationViewSurface,
      sessionConversationRef: sessionInfo?.conversationRef || null,
    }),
    [
      chatSurfaceState,
      conversationViewSurface,
      sessionInfo?.conversationRef,
    ],
  );
  const {
    canStop,
    currentTurnPresentationState,
    isBusy,
    liveTurnPhase: surfacePhase,
    liveTurnSource: surfaceSource,
    visibleTurnLifecycle,
  } = surfaceState;
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
    currentTurnPresentationState,
    includeQueryScreenshot,
    isBusy,
    canStop,
    surfacePhase,
    surfaceSource,
    visibleTurnLifecycle,
    speechModeEnabled,
    toggleBooleanConfig,
    toggleQueryScreenshot,
    toggleSpeechMode,
    wakewordSttEnabled,
    runManualCompaction,
  };
}
