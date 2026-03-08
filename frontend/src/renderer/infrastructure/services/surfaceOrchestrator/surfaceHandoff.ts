import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';

export async function isDashboardVisibleForComputerUseHandoff(): Promise<boolean> {
  const result = await IpcBridge.invoke<{ success?: boolean; data?: { visible?: boolean } }>(
    INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY,
    {},
  );
  return Boolean(result?.success && result?.data?.visible);
}

export async function handoffSurfaceForComputerUse(): Promise<void> {
  await IpcBridge.invoke(INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {});
}
