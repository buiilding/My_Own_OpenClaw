/**
 * Covers message send ui policy. behavior in the frontend test suite.
 */

import { DesktopMessageSendUiRuntime } from '../../src/renderer/app/runtime/desktopMessageSendUiRuntime';

describe('desktopMessageSendUiRuntime', () => {
  const {
    resolveMessageSendUiBehavior,
  } = DesktopMessageSendUiRuntime;

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

  test.each([
    ['main-window', 'never', false, false],
    ['main-window', 'never', true, false],
    ['main-window', 'auto', false, false],
    ['main-window', 'auto', true, true],
    ['main-window', 'always', false, true],
    ['main-window', 'always', true, true],
    ['overlay-chatbox', 'never', false, false],
    ['overlay-chatbox', 'never', true, false],
    ['overlay-chatbox', 'auto', false, false],
    ['overlay-chatbox', 'auto', true, true],
    ['overlay-chatbox', 'always', false, true],
    ['overlay-chatbox', 'always', true, true],
  ])(
    'return-to-chatbox matrix: surface=%s policy=%s screenshot=%s',
    (senderSurface, returnToChatboxPolicy, includeQueryScreenshot, expected) => {
      expect(resolveMessageSendUiBehavior({
        senderSurface,
        includeQueryScreenshot,
        returnToChatboxPolicy,
      }).shouldReturnToChatboxOnSend).toBe(expected);
    },
  );

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
