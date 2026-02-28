import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';
import { prepareOverlayToolFocus } from '../../frontend/src/renderer/infrastructure/services/surfaceOrchestrator/focusPreparation';

describe('surfaceOrchestrator focusPreparation helper', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('normalizes successful focus-prepare response metadata', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: {
        canVerifyExternalFocus: true,
        externalFocusActive: true,
      },
    });

    await expect(prepareOverlayToolFocus(180)).resolves.toEqual({
      success: true,
      reason: null,
      canVerifyExternalFocus: true,
      externalFocusActive: true,
    });
    expect(IpcBridge.invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.PREPARE_OVERLAY_TOOL_FOCUS, {
      waitMs: 180,
    });
  });

  test('normalizes failed focus-prepare response reason', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: false,
      reason: 'focus_failed',
      data: {
        canVerifyExternalFocus: false,
        externalFocusActive: false,
      },
    });

    await expect(prepareOverlayToolFocus(200)).resolves.toEqual({
      success: false,
      reason: 'focus_failed',
      canVerifyExternalFocus: false,
      externalFocusActive: false,
    });
  });

  test('treats missing fields as permissive defaults', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({});

    await expect(prepareOverlayToolFocus(120)).resolves.toEqual({
      success: true,
      reason: null,
      canVerifyExternalFocus: false,
      externalFocusActive: false,
    });
  });
});
