import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';

export type OverlayFocusPreparationResult = {
  success: boolean;
  reason: string | null;
  canVerifyExternalFocus: boolean;
  externalFocusActive: boolean;
};

export async function prepareOverlayToolFocus(
  waitMs: number,
  options: {
    skipDemotion?: boolean;
  } = {},
): Promise<OverlayFocusPreparationResult> {
  const focusPreparation = await IpcBridge.invoke(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
    waitMs,
    skipDemotion: options.skipDemotion === true,
  });

  return {
    success: focusPreparation?.success !== false,
    reason: typeof focusPreparation?.reason === 'string'
      ? focusPreparation.reason
      : null,
    canVerifyExternalFocus: focusPreparation?.data?.canVerifyExternalFocus === true,
    externalFocusActive: focusPreparation?.data?.externalFocusActive === true,
  };
}
