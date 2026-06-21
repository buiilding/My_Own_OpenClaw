/**
 * Coordinates window commands for renderer app-runtime clients.
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

export type MainWindowOpenTargetListener = (
  target: string,
) => void;

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function resolveMainWindowOpenTarget(payload: unknown): string {
  const source = recordOrEmpty(payload);
  return typeof source.target === 'string' ? source.target.trim() : '';
}

function optionalPositiveInteger(value: unknown): number | null {
  const normalized = Math.round(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function optionalNonEmptyString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function buildShowChatboxOptions(
  focus: unknown = null,
  reason: unknown = null,
): ShowChatboxOptions {
  const options: ShowChatboxOptions = {};
  const normalizedFocus = optionalBoolean(focus);
  if (normalizedFocus !== null) {
    options.focus = normalizedFocus;
  }
  const normalizedReason = optionalNonEmptyString(reason);
  if (normalizedReason) {
    options.reason = normalizedReason;
  }
  return options;
}

function buildHideChatboxOptions(reason: unknown = null): HideChatboxOptions {
  const options: HideChatboxOptions = {};
  const normalizedReason = optionalNonEmptyString(reason);
  if (normalizedReason) {
    options.reason = normalizedReason;
  }
  return options;
}

function buildShowMainWindowOptions(
  focus: unknown = null,
  maximize: unknown = null,
  open: unknown = null,
  reason: unknown = null,
): ShowMainWindowOptions {
  const options: ShowMainWindowOptions = {};
  const normalizedFocus = optionalBoolean(focus);
  if (normalizedFocus !== null) {
    options.focus = normalizedFocus;
  }
  const normalizedMaximize = optionalBoolean(maximize);
  if (normalizedMaximize !== null) {
    options.maximize = normalizedMaximize;
  }
  const normalizedOpen = optionalNonEmptyString(open);
  if (normalizedOpen) {
    options.open = normalizedOpen;
  }
  const normalizedReason = optionalNonEmptyString(reason);
  if (normalizedReason) {
    options.reason = normalizedReason;
  }
  return options;
}

function buildChatboxVisualAnchorHeightPayload(
  height: unknown,
  frameHeight: unknown = null,
): ChatboxVisualAnchorHeightPayload {
  const normalizedHeight = optionalPositiveInteger(height) || 0;
  const payload: ChatboxVisualAnchorHeightPayload = {
    height: normalizedHeight,
  };
  const normalizedFrameHeight = optionalPositiveInteger(frameHeight);
  if (normalizedFrameHeight !== null) {
    payload.frameHeight = normalizedFrameHeight;
  }
  return payload;
}

function buildChatboxHitTestPayload(active: unknown): ChatboxHitTestPayload {
  return {
    active: active === true,
  };
}

function buildChatboxTextEntryActivationPayload(
  reason: unknown,
): ActivateChatboxTextEntryPayload {
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  return normalizedReason ? { reason: normalizedReason } : {};
}

export const DesktopWindowRuntimeClient = {
  showChatbox(options: ShowChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_CHATBOX, options);
  },

  showChatboxWithValues(focus: unknown = null, reason: unknown = null): Promise<unknown> {
    return DesktopWindowRuntimeClient.showChatbox(
      buildShowChatboxOptions(focus, reason),
    );
  },

  hideChatbox(options: HideChatboxOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.HIDE_CHATBOX, options);
  },

  hideChatboxForReason(reason: unknown = null): Promise<unknown> {
    return DesktopWindowRuntimeClient.hideChatbox(
      buildHideChatboxOptions(reason),
    );
  },

  showMainWindow(options: ShowMainWindowOptions = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SHOW_MAIN_WINDOW, options);
  },

  showMainWindowWithValues(
    focus: unknown = null,
    maximize: unknown = null,
    open: unknown = null,
    reason: unknown = null,
  ): Promise<unknown> {
    return DesktopWindowRuntimeClient.showMainWindow(
      buildShowMainWindowOptions(focus, maximize, open, reason),
    );
  },

  setChatboxVisualAnchorHeight(payload: ChatboxVisualAnchorHeightPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_VISUAL_ANCHOR_HEIGHT, payload);
  },

  setChatboxVisualAnchorHeightValue(
    height: unknown,
    frameHeight: unknown = null,
  ): Promise<unknown> {
    return DesktopWindowRuntimeClient.setChatboxVisualAnchorHeight(
      buildChatboxVisualAnchorHeightPayload(height, frameHeight),
    );
  },

  activateChatboxTextEntry(payload: ActivateChatboxTextEntryPayload = {}): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.ACTIVATE_CHATBOX_TEXT_ENTRY, payload);
  },

  activateChatboxTextEntryForReason(reason: unknown): Promise<unknown> {
    return DesktopWindowRuntimeClient.activateChatboxTextEntry(
      buildChatboxTextEntryActivationPayload(reason),
    );
  },

  setChatboxHitTestActive(payload: ChatboxHitTestPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_CHATBOX_HIT_TEST_ACTIVE, payload);
  },

  setChatboxHitTestActiveValue(active: unknown): Promise<unknown> {
    return DesktopWindowRuntimeClient.setChatboxHitTestActive(
      buildChatboxHitTestPayload(active),
    );
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
    return IpcBridge.on(
      ON_CHANNELS.MAIN_WINDOW_OPEN_TARGET,
      (payload: unknown) => listener(resolveMainWindowOpenTarget(payload)),
    );
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
