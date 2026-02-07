import {
  appendTranscriptionText,
  buildValueAfterPaste,
  createEmptyTranscriptionRegion,
  replaceTranscriptionText,
  updateRegionAfterInputChange,
  updateRegionAfterPaste,
} from '../../frontend/src/renderer/features/chat/utils/transcriptionRegions';

describe('transcriptionRegions', () => {
  test('appends transcription text and marks active region at end', () => {
    const appended = appendTranscriptionText('base', 'hello');
    expect(appended).toEqual({
      value: 'basehello',
      region: { start: 4, end: 9, active: true },
    });
  });

  test('replaces active transcription region with new chunk', () => {
    const replaced = replaceTranscriptionText('preHELLOpost', { start: 3, end: 8, active: true }, 'world');
    expect(replaced).toEqual({
      value: 'preworldpost',
      region: { start: 3, end: 8, active: true },
    });
  });

  test('invalidates region when input cursor is inside active region', () => {
    const region = updateRegionAfterInputChange(
      { start: 2, end: 6, active: true },
      'abCDEFgh',
      'abCdEFgh',
      4,
    );
    expect(region).toEqual(createEmptyTranscriptionRegion());
  });

  test('shifts region when user input happens before active region', () => {
    const region = updateRegionAfterInputChange(
      { start: 5, end: 9, active: true },
      '01234ABCD',
      '0x1234ABCD',
      1,
    );
    expect(region).toEqual({ start: 6, end: 10, active: true });
  });

  test('builds pasted value from selection range', () => {
    const pasted = buildValueAfterPaste('abcXYZdef', '123', 3, 6);
    expect(pasted).toEqual({ value: 'abc123def', start: 3 });
  });

  test('updates region after paste based on cursor position', () => {
    expect(updateRegionAfterPaste({ start: 5, end: 8, active: true }, 2, 3)).toEqual({
      start: 8,
      end: 11,
      active: true,
    });
    expect(updateRegionAfterPaste({ start: 5, end: 8, active: true }, 6, 2)).toEqual(
      createEmptyTranscriptionRegion(),
    );
  });
});
