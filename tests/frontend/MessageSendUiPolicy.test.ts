import {
  resolveMessageSendUiBehavior,
} from '../../frontend/src/renderer/features/chat/policies/messageSendUiPolicy';

describe('messageSendUiPolicy', () => {
  test('defaults per UI surface are explicit', () => {
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: false,
    }).returnToChatboxPolicy).toBe('auto');
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: false,
    }).returnToChatboxPolicy).toBe('never');
  });

  test('return-to-chatbox resolution matrix is stable', () => {
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
      returnToChatboxPolicy: 'never',
    }).shouldReturnToChatboxOnSend).toBe(false);
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: false,
      returnToChatboxPolicy: 'never',
    }).shouldReturnToChatboxOnSend).toBe(false);
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
      returnToChatboxPolicy: 'auto',
    }).shouldReturnToChatboxOnSend).toBe(true);
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: false,
      returnToChatboxPolicy: 'auto',
    }).shouldReturnToChatboxOnSend).toBe(false);
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
      returnToChatboxPolicy: 'always',
    }).shouldReturnToChatboxOnSend).toBe(true);
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: false,
      returnToChatboxPolicy: 'always',
    }).shouldReturnToChatboxOnSend).toBe(true);
  });

  test('behavior resolver applies default policy when override is missing', () => {
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
    })).toEqual({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'auto',
      shouldReturnToChatboxOnSend: true,
    });

    expect(resolveMessageSendUiBehavior({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: true,
    })).toEqual({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'never',
      shouldReturnToChatboxOnSend: false,
    });
  });

  test('behavior resolver respects explicit policy overrides', () => {
    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: false,
      returnToChatboxPolicy: 'always',
    })).toEqual({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'always',
      shouldReturnToChatboxOnSend: true,
    });

    expect(resolveMessageSendUiBehavior({
      senderSurface: 'overlay-chatbox',
      includeQueryScreenshot: true,
      returnToChatboxPolicy: 'auto',
    })).toEqual({
      senderSurface: 'overlay-chatbox',
      returnToChatboxPolicy: 'auto',
      shouldReturnToChatboxOnSend: true,
    });

    expect(resolveMessageSendUiBehavior({
      senderSurface: 'main-window',
      includeQueryScreenshot: true,
      returnToChatboxPolicy: 'never',
    })).toEqual({
      senderSurface: 'main-window',
      returnToChatboxPolicy: 'never',
      shouldReturnToChatboxOnSend: false,
    });
  });
});
