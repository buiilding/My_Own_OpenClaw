/**
 * Covers chat message sender payloads. behavior in the frontend test suite.
 */

import { DesktopChatSendPayloadRuntime } from '../../frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime';

describe('desktopChatSendPayloadRuntime', () => {
  const {
    normalizeOutgoingPayload,
  } = DesktopChatSendPayloadRuntime;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('normalizes string payload and typed resource payloads', () => {
    expect(normalizeOutgoingPayload('hello')).toEqual({
      text: 'hello',
      clipboardImages: [],
      readableFiles: [],
    });

    const payload = normalizeOutgoingPayload({
      text: 'hello',
      clipboardImages: [{ base64: 'def', filename: 'shot-2.png' }],
      readableFiles: [{ filePath: '/tmp/a', filename: 'a.txt' }],
    });
    expect(payload).toEqual({
      text: 'hello',
      clipboardImages: [
        { base64: 'def', filename: 'shot-2.png' },
      ],
      readableFiles: [{ filePath: '/tmp/a', filename: 'a.txt' }],
    });
  });

  test('rejects removed singular clipboard image compatibility payloads', () => {
    expect(normalizeOutgoingPayload({
      text: 'hello',
      // @ts-expect-error singular clipboardImage is no longer part of the send contract
      clipboardImage: { base64: 'abc', filename: 'shot.png' },
    })).toBeNull();
  });

  test.each([
    'attachmentContext',
    'attachmentFilenames',
    'attachments',
    'captureMeta',
    'displayAttachments',
    'screenshot',
    'screenshotRef',
    'screenshotRefs',
    'screenshotUrl',
  ])('rejects removed renderer attachment alias field %s', (field) => {
    expect(normalizeOutgoingPayload({
      text: 'hello',
      [field]: field === 'attachmentFilenames' || field === 'screenshotRefs'
        ? ['artifact-1']
        : 'artifact-1',
    } as any)).toBeNull();
  });
});
