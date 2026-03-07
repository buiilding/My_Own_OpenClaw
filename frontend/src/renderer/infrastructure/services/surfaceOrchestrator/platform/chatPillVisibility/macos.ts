import type {
  ChatPillCollapseResult,
  ChatPillRestoreResult,
} from '../../types';

const macosChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return false;
  },

  async collapseChatPillForBackgroundCapture(): Promise<ChatPillCollapseResult> {
    return {
      collapsed: false,
      timing: {
        hideInvokeTime: 0,
        settleTime: 0,
      },
    };
  },

  async restoreChatPillInactive(): Promise<ChatPillRestoreResult> {
    return {
      restored: false,
      restoreInvokeTime: 0,
    };
  },
};

export default macosChatPillVisibilityRuntime;
