/**
 * Coordinates desktop window commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS, SEND_CHANNELS } from '../../infrastructure/ipc/bridge';

export type ShowChatboxOptions = {
  focus?: boolean;
  reason?: string;
};

export type ShowMainWindowOptions = {
  focus?: boolean;
  maximize?: boolean;
  open?: string;
  reason?: string;
};

export type HideChatboxOptions = {
  reason?: string;
};

export type ChatboxVisualAnchorHeightPayload = {
  height: number;
  frameHeight?: number;
};

export type ChatboxHitTestPayload = {
  active: boolean;
};

export type ActivateChatboxTextEntryPayload = {
  reason?: string;
};

export type MoveChatboxTarget = {
  x: number;
  y: number;
};

export type WindowRuntimeEventListener = (payload?: unknown) => void;

export type MainWindowOpenTargetPayload = {
  target?: string;
};

export type MainWindowOpenTargetListener = (
  payload?: MainWindowOpenTargetPayload,
) => void;

export const DesktopWindowRuntimeClient = {
  showChatbox(options: ShowChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, options);
  },

  hideChatbox(options: HideChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX, options);
  },

  showMainWindow(options: ShowMainWindowOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, options);
  },

  setChatboxVisualAnchorHeight(payload: ChatboxVisualAnchorHeightPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, payload);
  },

  activateChatboxTextEntry(payload: ActivateChatboxTextEntryPayload = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.ACTIVATE_CHATBOX_TEXT_ENTRY, payload);
  },

  setChatboxHitTestActive(payload: ChatboxHitTestPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE, payload);
  },

  moveChatboxTo(target: MoveChatboxTarget): void {
    IpcBridge.send(SEND_CHANNELS.MOVE_CHATBOX_TO, target);
  },

  onChatboxFocus(listener: WindowRuntimeEventListener): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.CHATBOX_FOCUS, listener);
  },

  onWakewordSttTrigger(listener: WindowRuntimeEventListener): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.WAKEWORD_STT_TRIGGER, listener);
  },

  onMainWindowOpenTarget(listener: MainWindowOpenTargetListener): (() => void) | undefined {
    return IpcBridge.on(ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET, listener as WindowRuntimeEventListener);
  },

  minimizeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_MINIMIZE);
  },

  toggleMaximizeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);
  },

  closeWindow(): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.WINDOW_CLOSE);
  },
};
