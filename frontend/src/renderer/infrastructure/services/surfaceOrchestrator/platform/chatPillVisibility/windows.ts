const windowsChatPillVisibilityRuntime = {
  shouldManageChatPillVisibilityForBackgroundCapture(): boolean {
    return false;
  },

  async collapseChatPillForBackgroundCapture(): Promise<boolean> {
    return false;
  },

  async restoreChatPillInactive(): Promise<boolean> {
    return false;
  },
};

export default windowsChatPillVisibilityRuntime;
