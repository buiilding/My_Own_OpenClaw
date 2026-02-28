import { IpcBridge, INVOKE_CHANNELS } from '../../ipc/bridge';

export async function isMainWindowVisible(): Promise<boolean> {
  try {
    const result = await IpcBridge.invoke(INVOKE_CHANNELS.GET_MAIN_WINDOW_VISIBILITY);
    return result?.success === true && result?.data?.visible === true;
  } catch (_error) {
    return false;
  }
}
