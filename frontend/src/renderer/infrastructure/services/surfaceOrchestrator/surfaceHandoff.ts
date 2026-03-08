import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';
import { isMainWindowVisible } from './windowVisibility';

export async function isDashboardVisibleForComputerUseHandoff(): Promise<boolean> {
  return isMainWindowVisible();
}

export async function handoffSurfaceForComputerUse(): Promise<void> {
  await IpcBridge.invoke(INVOKE_CHANNELS.HANDOFF_SURFACE_FOR_COMPUTER_USE, {});
}
