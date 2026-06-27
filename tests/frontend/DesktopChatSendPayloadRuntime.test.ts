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

  test('rejects padded required resource handle fields instead of repairing them', () => {
    expect(normalizeOutgoingPayload({
      text: 'bad image',
      clipboardImages: [{ base64: ' abc ', filename: 'shot.png' }],
    })).toEqual({
      text: 'bad image',
      clipboardImages: [],
      readableFiles: [],
    });

    expect(normalizeOutgoingPayload({
      text: 'bad file',
      readableFiles: [{ filePath: ' /tmp/a ', filename: 'a.txt' }],
    })).toEqual({
      text: 'bad file',
      clipboardImages: [],
      readableFiles: [],
    });
  });

  test('drops padded optional clipboard metadata without trimming it into resources', () => {
    expect(normalizeOutgoingPayload({
      text: 'image',
      clipboardImages: [{
        base64: 'abc',
        contentType: ' image/png ',
        filename: ' shot.png ',
      }],
    })).toEqual({
      text: 'image',
      clipboardImages: [{ base64: 'abc' }],
      readableFiles: [],
    });
  });

  test('rejects removed singular clipboard image compatibility payloads', () => {
    expect(normalizeOutgoingPayload({
      text: 'hello',
      // @ts-expect-error singular clipboardImage is no longer part of the send contract
      clipboardImage: { base64: 'abc', filename: 'shot.png' },
    })).toBeNull();
  });

  test('rejects payload objects with unsupported fields by positive send contract', () => {
    expect(normalizeOutgoingPayload({
      text: 'hello',
      legacyRendererField: 'artifact-1',
    } as any)).toBeNull();
  });
});
