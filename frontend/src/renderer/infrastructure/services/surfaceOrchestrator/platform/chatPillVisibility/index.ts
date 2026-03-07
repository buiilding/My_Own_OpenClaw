import linuxRuntime from './linux';
import macosRuntime from './macos';
import windowsRuntime from './windows';
import type {
  ChatPillCollapseResult,
  ChatPillRestoreResult,
} from '../../types';

type ChatPillVisibilityRuntime = typeof linuxRuntime;

function resolveChatPillVisibilityRuntime(): ChatPillVisibilityRuntime {
  if (typeof navigator === 'undefined') {
    return windowsRuntime;
  }
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  if (/windows/i.test(userAgent)) {
    return windowsRuntime;
  }
  if (/macintosh|mac os x|macintel/i.test(userAgent)) {
    return macosRuntime;
  }
  if (/linux/i.test(userAgent)) {
    return linuxRuntime;
  }
  return windowsRuntime;
}

export function shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
  return resolveChatPillVisibilityRuntime().shouldManageChatPillVisibilityForBackgroundCapture();
}

export async function collapseChatPillForBackgroundCapture(
  options: { waitMs?: number } = {},
): Promise<ChatPillCollapseResult> {
  return await resolveChatPillVisibilityRuntime().collapseChatPillForBackgroundCapture(options);
}

export async function restoreChatPillInactive(): Promise<ChatPillRestoreResult> {
  return await resolveChatPillVisibilityRuntime().restoreChatPillInactive();
}
