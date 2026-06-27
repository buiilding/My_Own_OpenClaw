/**
 * Covers memory settings dialog runtime behavior in the frontend test suite.
 */

import {
  DesktopMemorySettingsDialogRuntime,
} from '../../src/renderer/app/runtime/desktopMemorySettingsDialogRuntime';
import * as MemorySettingsDialogRuntime from '../../src/renderer/app/runtime/desktopMemorySettingsDialogRuntime';

const {
  confirmMemorySettingsDestructiveAction,
} = DesktopMemorySettingsDialogRuntime;

describe('desktopMemorySettingsDialogRuntime', () => {
  test('confirmMemorySettingsDestructiveAction returns true only when browser confirmation is accepted', () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    try {
      confirmSpy.mockReturnValueOnce(false);
      expect(confirmMemorySettingsDestructiveAction('Delete memories?')).toBe(false);

      confirmSpy.mockReturnValueOnce(true);
      expect(confirmMemorySettingsDestructiveAction('Delete chats?')).toBe(true);
      expect(confirmSpy).toHaveBeenLastCalledWith('Delete chats?');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('keeps lower-level browser dialog helpers private', () => {
    expect(MemorySettingsDialogRuntime).not.toHaveProperty('getDialogHost');
  });
});
