/**
 * Covers desktop transcription region runtime behavior in the frontend test suite.
 */

import {
  DesktopTranscriptionRegionRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime';

const {
  appendTranscriptionText,
  buildValueAfterPaste,
  createEmptyTranscriptionRegion,
  replaceTranscriptionText,
  updateRegionAfterInputChange,
  updateRegionAfterPaste,
} = DesktopTranscriptionRegionRuntime;

describe('desktopTranscriptionRegionRuntime', () => {
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
    expect(updateRegionAfterPaste({ start: 5, end: 8, active: true }, 2, 2, 3)).toEqual({
      start: 8,
      end: 11,
      active: true,
    });
    expect(updateRegionAfterPaste({ start: 5, end: 8, active: true }, 6, 6, 2)).toEqual(
      createEmptyTranscriptionRegion(),
    );
  });

  test('shifts region by net paste delta when replacement is before active region', () => {
    expect(updateRegionAfterPaste({ start: 10, end: 14, active: true }, 0, 5, 2)).toEqual({
      start: 7,
      end: 11,
      active: true,
    });
  });

  test('clears region when paste replacement overlaps active region', () => {
    expect(updateRegionAfterPaste({ start: 10, end: 14, active: true }, 8, 12, 2)).toEqual(
      createEmptyTranscriptionRegion(),
    );
  });
});
