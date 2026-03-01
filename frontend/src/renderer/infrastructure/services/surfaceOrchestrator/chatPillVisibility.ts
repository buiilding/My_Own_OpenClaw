import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';

export function isLinuxDesktopPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const isLinux = /linux/i.test(userAgent);
  const isWindows = /windows/i.test(userAgent);
  const isMac = /macintosh|mac os x|macintel/i.test(userAgent);
  return isLinux && !isWindows && !isMac;
}

export async function collapseChatPillForBackgroundCapture(): Promise<void> {
  if (!isLinuxDesktopPlatform()) {
    return;
  }
  // Hide-only collapse avoids show->hide flashes when the pill is already hidden.
  await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
}

export async function restoreChatPillInactive(): Promise<void> {
  if (!isLinuxDesktopPlatform()) {
    return;
  }
  await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
}
