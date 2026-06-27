/**
 * Covers dashboard conversation dialog runtime behavior in the frontend test suite.
 */

import {
  DesktopDashboardConversationDialogRuntime,
} from '../../src/renderer/app/runtime/desktopDashboardConversationDialogRuntime';
import * as DashboardConversationDialogRuntime from '../../src/renderer/app/runtime/desktopDashboardConversationDialogRuntime';

const {
  confirmDashboardConversationDelete,
  requestDashboardConversationRenameTitle,
} = DesktopDashboardConversationDialogRuntime;

describe('desktopDashboardConversationDialogRuntime', () => {
  test('requestDashboardConversationRenameTitle trims changed browser prompt input', () => {
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('  New title  ');
    try {
      expect(requestDashboardConversationRenameTitle({
        conversation_id: 'conv-1',
        title: 'Old title',
      })).toBe('New title');
      expect(promptSpy).toHaveBeenCalledWith('Rename chat', 'Old title');
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('requestDashboardConversationRenameTitle ignores cancelled, blank, or unchanged input', () => {
    const promptSpy = jest.spyOn(window, 'prompt');
    try {
      promptSpy.mockReturnValueOnce(null);
      expect(requestDashboardConversationRenameTitle({ title: 'Old title' })).toBeNull();

      promptSpy.mockReturnValueOnce('   ');
      expect(requestDashboardConversationRenameTitle({ title: 'Old title' })).toBeNull();

      promptSpy.mockReturnValueOnce('Old title');
      expect(requestDashboardConversationRenameTitle({ title: 'Old title' })).toBeNull();
    } finally {
      promptSpy.mockRestore();
    }
  });

  test('confirmDashboardConversationDelete returns true only when browser confirmation is accepted', () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    try {
      confirmSpy.mockReturnValueOnce(false);
      expect(confirmDashboardConversationDelete()).toBe(false);

      confirmSpy.mockReturnValueOnce(true);
      expect(confirmDashboardConversationDelete()).toBe(true);
      expect(confirmSpy).toHaveBeenLastCalledWith('Delete this chat? This cannot be undone.');
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('keeps lower-level browser dialog helpers private', () => {
    expect(DashboardConversationDialogRuntime).not.toHaveProperty('getDialogHost');
    expect(DashboardConversationDialogRuntime).not.toHaveProperty('RENAME_CONVERSATION_PROMPT_TITLE');
    expect(DashboardConversationDialogRuntime).not.toHaveProperty('DELETE_CONVERSATION_CONFIRM_MESSAGE');
  });
});
