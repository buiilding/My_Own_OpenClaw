import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';

export async function collapseChatPillForBackgroundCapture(): Promise<void> {
  await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
  await IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX);
}

export async function restoreChatPillInactive(): Promise<void> {
  await IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, { focus: false });
}
