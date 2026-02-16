import {
  defaultReturnToChatboxPolicyForSurface,
  resolveMessageSendUiBehavior,
  resolveReturnToChatboxOnSend,
} from '../../frontend/src/renderer/features/chat/policies/messageSendUiPolicy';

describe('messageSendUiPolicy', () => {
  test('defaults per UI surface are explicit', () => {
    expect(defaultReturnToChatboxPolicyForSurface('main-window')).toBe('auto');
    expect(defaultReturnToChatboxPolicyForSurface('overlay-chatbox')).toBe('never');
  });

  test('return-to-chatbox resolution matrix is stable', () => {
    expect(resolveReturnToChatboxOnSend('never', true)).toBe(false);
    expect(resolveReturnToChatboxOnSend('never', false)).toBe(false);
    expect(resolveReturnToChatboxOnSend('auto', true)).toBe(true);
    expect(resolveReturnToChatboxOnSend('auto', false)).toBe(false);
    expect(resolveReturnToChatboxOnSend('always', true)).toBe(true);
    expect(resolveReturnToChatboxOnSend('always', false)).toBe(true);
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
