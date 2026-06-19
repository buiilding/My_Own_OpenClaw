/**
 * Coordinates response overlay window commands for renderer runtime clients.
 */

import { IpcBridge, INVOKE_CHANNELS, ON_CHANNELS } from '../../infrastructure/ipc/bridge';

export type ResponseboxSizePayload = {
  visible: boolean;
  width: number;
  height: number;
  compact_hover?: boolean;
  turn_ref?: string | null;
  stale_guard_ref?: string | null;
  dismissed?: boolean;
};

export type ResponseboxHitTestPayload = {
  active: boolean;
};

export type ResponseOverlayVisibilityPayload = {
  visible: boolean;
};

export type ResponseOverlayVisibilityListener = (
  visible: boolean,
) => void;

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function normalizeResponseOverlayVisibilityPayload(
  payload: unknown,
): ResponseOverlayVisibilityPayload {
  const source = recordOrEmpty(payload);
  return {
    visible: source.visible === true,
  };
}

export const DesktopResponseOverlayRuntimeClient = {
  setResponseboxSize(payload: ResponseboxSizePayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_SIZE, payload);
  },

  setResponseboxHitTestActive(payload: ResponseboxHitTestPayload): Promise<unknown> {
    return IpcBridge.invoke(INVOKE_CHANNELS.SET_RESPONSEBOX_HIT_TEST_ACTIVE, payload);
  },

  onResponseOverlayVisibility(
    listener: ResponseOverlayVisibilityListener,
  ): (() => void) | undefined {
    return IpcBridge.on(
      ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY,
      (payload: unknown) => listener(normalizeResponseOverlayVisibilityPayload(payload).visible),
    );
  },
};
