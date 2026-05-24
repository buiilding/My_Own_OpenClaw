describe('DesktopConversationContinuityService', () => {
  test('rehydrateMessages routes replace-mode history through the SDK transport', async () => {
    const send = jest.fn();
    const originalIpc = window.ipc;
    window.ipc = {
      send,
      invoke: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
    };
    const { DesktopConversationContinuityService } = require(
      '../../frontend/src/renderer/app/runtime/desktopConversationContinuityService',
    );

    try {
      await DesktopConversationContinuityService.rehydrateMessages({
        conversationRef: 'conv-rehydrate',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi', message_type: 'assistant' },
        ],
        workspacePath: ' /workspace/WindieOS ',
      });

      expect(send).toHaveBeenCalledWith('to-backend', {
        type: 'rehydrate',
        payload: {
          conversation_ref: 'conv-rehydrate',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi', message_type: 'assistant' },
          ],
          rehydrate_mode: 'replace',
          workspace_path: '/workspace/WindieOS',
        },
      });
    } finally {
      window.ipc = originalIpc;
    }
  });
});
