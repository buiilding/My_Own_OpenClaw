/**
 * Covers desktop conversation session runtime client behavior in the frontend test suite.
 */

import { DesktopConversationSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopConversationSessionRuntimeClient';

describe('DesktopConversationSessionRuntimeClient', () => {
  test('bindTranscriptUser delegates normalized user binding to the transcript updater', () => {
    const updateTranscriptSession = jest.fn();

    expect(DesktopConversationSessionRuntimeClient.bindTranscriptUser({
      userId: ' user-bound ',
      updateTranscriptSession,
    })).toBe(true);

    expect(updateTranscriptSession).toHaveBeenCalledWith(undefined, 'user-bound');
  });

  test('bindTranscriptUser ignores invalid user ids', () => {
    const updateTranscriptSession = jest.fn();

    expect(DesktopConversationSessionRuntimeClient.bindTranscriptUser({
      userId: '   ',
      updateTranscriptSession,
    })).toBe(false);

    expect(updateTranscriptSession).not.toHaveBeenCalled();
  });

  test('applyEventChatConversationProjection promotes explicit user-message refs', () => {
    const setChatConversationRef = jest.fn();

    expect(DesktopConversationSessionRuntimeClient.applyEventChatConversationProjection({
      eventType: 'user_message',
      explicitConversationRef: 'conv-next',
      resolvedConversationRef: ' conv-next ',
      activeConversationRef: 'conv-current',
      setChatConversationRef,
    })).toBe('conv-next');

    expect(setChatConversationRef).toHaveBeenCalledWith('conv-next');
  });
});
