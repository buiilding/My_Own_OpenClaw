/**
 * Coordinates the manual compaction runtime for the renderer UI.
 */

import { DesktopRendererConfigRuntimeClient } from './desktopRendererConfigRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';
import { DesktopConversationContinuityService } from './desktopConversationContinuityService';
import {
  DesktopChatStreamThinkingRuntime,
} from './desktopChatStreamThinkingRuntime';

const {
  getCompactionFailedThinkingStatus,
  getCompactionStartedThinkingStatus,
} = DesktopChatStreamThinkingRuntime;

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function runManualCompaction({
  config,
  conversationRef,
  setThinkingStatus,
  setThinkingSourceEventType,
  warningContext = 'manual compaction',
}) {
  setThinkingStatus(getCompactionStartedThinkingStatus());
  setThinkingSourceEventType('context-compaction-started');
  await waitForNextPaint();

  try {
    const deferredQueryModelSelection = DesktopRendererConfigRuntimeClient
      .buildDeferredQueryModelSelection(config);
    if (deferredQueryModelSelection) {
      DesktopSettingsRuntimeClient.setModel(deferredQueryModelSelection);
    }

    const normalizedConversationRef = conversationRef || null;
    await DesktopConversationContinuityService.compactHistory(true, normalizedConversationRef);
  } catch (error) {
    console.warn(`[${warningContext}] Failed to start manual compaction:`, error);
    setThinkingStatus(getCompactionFailedThinkingStatus());
    setThinkingSourceEventType('context-compaction-failed');
  }
}

export const DesktopManualCompactionRuntime = Object.freeze({
  runManualCompaction,
});
