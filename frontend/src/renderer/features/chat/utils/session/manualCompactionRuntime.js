import { buildDeferredQueryModelSelection } from '../../../../app/providers/appConfigBackendSync';
import { ApiClient } from '../../../../infrastructure/api/client';
import { ensureConversationInferenceSessionHydrated } from '../../session/conversationInferenceSessionRuntime';
import { COMPACTION_THINKING_STATUS } from '../chatStream/chatStreamThinkingStatus';

export function waitForNextPaint() {
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
  userId,
  setThinkingStatus,
  setThinkingSourceEventType,
  warningContext = 'manual compaction',
}) {
  setThinkingStatus(COMPACTION_THINKING_STATUS);
  setThinkingSourceEventType('context-compaction-started');
  await waitForNextPaint();

  const deferredQueryModelSelection = buildDeferredQueryModelSelection(config);
  if (deferredQueryModelSelection) {
    ApiClient.setModel(deferredQueryModelSelection);
  }

  const normalizedConversationRef = conversationRef || null;
  if (normalizedConversationRef) {
    try {
      await ensureConversationInferenceSessionHydrated({
        conversationRef: normalizedConversationRef,
        userId: userId || null,
      });
    } catch (error) {
      console.warn(`[${warningContext}] Failed to rehydrate conversation before compaction:`, error);
    }
  }

  ApiClient.compactHistory(true, normalizedConversationRef);
}
