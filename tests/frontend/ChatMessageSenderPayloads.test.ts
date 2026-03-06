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

  test('normalizes string payload and attachment metadata payloads', () => {
    expect(normalizeOutgoingPayload('hello')).toEqual({
      text: 'hello',
      clipboardImages: [],
      readableFiles: [],
    });

    const payload = normalizeOutgoingPayload({
      text: 'hello',
      clipboardImage: { base64: 'abc', filename: 'shot.png' },
      clipboardImages: [{ base64: 'def', filename: 'shot-2.png' }],
      readableFiles: [{ filePath: '/tmp/a', filename: 'a.txt' }],
    });
    expect(payload).toEqual({
      text: 'hello',
      clipboardImages: [
        { base64: 'def', filename: 'shot-2.png' },
        { base64: 'abc', filename: 'shot.png' },
      ],
      readableFiles: [{ filePath: '/tmp/a', filename: 'a.txt' }],
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

    const context = await buildReadableFileAttachmentContext([
      { filePath: '/tmp/a', filename: 'a.txt' },
    ]);

    expect(invokeSpy).toHaveBeenCalledWith(INVOKE_CHANNELS.EXECUTE_TOOL, {
      toolName: 'read_file',
      args: { file_path: '/tmp/a' },
      skipAutoCapture: true,
    });
    expect(context).toContain('Attached File: a.txt');
    expect(context).toContain('File body text');
  });

  test('skips failed/empty readable-file calls and returns null when nothing is usable', async () => {
    jest.spyOn(IpcBridge, 'invoke').mockResolvedValue({
      success: false,
      error: 'nope',
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const context = await buildReadableFileAttachmentContext([
      { filePath: '/tmp/a', filename: 'a.txt' },
    ]);

    expect(context).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
