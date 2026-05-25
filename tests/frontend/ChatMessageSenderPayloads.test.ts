import {
  normalizeAttachmentFilenames,
  normalizeOutgoingPayload,
} from '../../frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderPayloads';
import { buildReadableFileAttachmentContext } from '../../frontend/src/renderer/features/chat/utils/messageSender/readableFileAttachmentContext';
import { IpcBridge, INVOKE_CHANNELS } from '../../frontend/src/renderer/infrastructure/ipc/bridge';

describe('chatMessageSenderPayloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('normalizes string payload and attachment metadata payloads', () => {
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

  test('ignores removed singular clipboard image compatibility payloads', () => {
    expect(normalizeOutgoingPayload({
      text: 'hello',
      // @ts-expect-error singular clipboardImage is no longer part of the send contract
      clipboardImage: { base64: 'abc', filename: 'shot.png' },
    })).toEqual({
      text: 'hello',
      clipboardImages: [],
      readableFiles: [],
    });
  });

  test('dedupes non-empty attachment filenames', () => {
    expect(normalizeAttachmentFilenames(
      [{ base64: 'abc', filename: 'a.png' }, { base64: 'def', filename: 'a.png' }],
      [{ filePath: '/tmp/a', filename: 'a.png' }, { filePath: '/tmp/b', filename: 'b.txt' }],
    )).toEqual(['a.png', 'b.txt']);
  });

  test('builds readable file attachment context from successful read_file calls', async () => {
    const invokeSpy = jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: true,
      data: { llm_content: 'File body text' },
    });

    const result = await buildReadableFileAttachmentContext([
      { filePath: '/tmp/a', filename: 'a.txt' },
    ]);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.READ_ATTACHMENT_FILE, {
      filePath: '/tmp/a',
    });
    expect(result.failures).toEqual([]);
    expect(result.context).toContain('Attached File: a.txt');
    expect(result.context).toContain('File body text');
  });

  test('returns failed readable-file calls instead of silently omitting them', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: false,
      error: 'nope',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await buildReadableFileAttachmentContext([
      { filePath: '/tmp/a', filename: 'a.txt' },
    ]);

    expect(result.context).toBeNull();
    expect(result.failures).toEqual([
      {
        filePath: '/tmp/a',
        filename: 'a.txt',
        error: 'nope',
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('keeps successful readable-file context while reporting partial failures', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockImplementation(async (_channel, payload: any) => {
      if (payload.filePath === '/tmp/a') {
        return {
          success: true,
          data: { llm_content: 'Readable A' },
        };
      }
      return {
        success: false,
        error: 'missing file',
      };
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await buildReadableFileAttachmentContext([
      { filePath: '/tmp/a', filename: 'a.txt' },
      { filePath: '/tmp/b', filename: 'b.txt' },
    ]);

    expect(result.context).toContain('Readable A');
    expect(result.failures).toEqual([
      {
        filePath: '/tmp/b',
        filename: 'b.txt',
        error: 'missing file',
      },
    ]);
  });
});
