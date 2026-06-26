/**
 * Owns SDK compaction command calls for renderer stream handlers.
 */

import type {
  CompactedReplaySnapshot,
} from './desktopConversationRuntimeContracts';
import { DesktopConversationContinuityService } from './desktopConversationContinuityService';

async function persistCompactedReplaySnapshot(
  snapshot: CompactedReplaySnapshot,
  userId: string,
): Promise<void> {
  await DesktopConversationContinuityService.replaceCompactedReplay(snapshot, userId);
}

export const DesktopChatStreamCompactionRuntime = Object.freeze({
  persistCompactedReplaySnapshot,
});
