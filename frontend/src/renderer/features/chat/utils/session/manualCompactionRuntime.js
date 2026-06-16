/**
 * Coordinates the manual compaction runtime for the renderer UI.
 */

import { buildDeferredQueryModelSelection } from '../../../../app/providers/appConfigBackendSync';
import { DesktopSettingsRuntimeClient } from '../../../../app/runtime/desktopSettingsRuntimeClient';
import { DesktopConversationContinuityService } from '../../../../app/runtime/desktopConversationContinuityService';
import {
  COMPACTION_FAILED_THINKING_STATUS,
  COMPACTION_THINKING_STATUS,
} from '../chatStream/chatStreamThinkingStatus';

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function runManualCompaction({
  config,
  conversationRef,
  setThinkingStatus,
  setThinkingSourceEventType,
  warningContext = 'manual compaction',
}) {
  setThinkingStatus(COMPACTION_THINKING_STATUS);
  setThinkingSourceEventType('context-compaction-started');
  await waitForNextPaint();

  try {
    const deferredQueryModelSelection = buildDeferredQueryModelSelection(config);
    if (deferredQueryModelSelection) {
      DesktopSettingsRuntimeClient.setModel(deferredQueryModelSelection);
    }

    const normalizedConversationRef = conversationRef || null;
    await DesktopConversationContinuityService.compactHistory(true, normalizedConversationRef);
  } catch (error) {
    console.warn(`[${warningContext}] Failed to start manual compaction:`, error);
    setThinkingStatus(COMPACTION_FAILED_THINKING_STATUS);
    setThinkingSourceEventType('context-compaction-failed');
  }
}
