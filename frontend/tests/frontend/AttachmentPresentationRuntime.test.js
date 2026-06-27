/**
 * Covers attachment presentation runtime behavior in the frontend test suite.
 */

import { DesktopAttachmentPresentationRuntime } from '../../src/renderer/app/runtime/desktopAttachmentPresentationRuntime';

describe('desktopAttachmentPresentationRuntime', () => {
  test('resolveReadableFileTypeLabel normalizes readable file extensions', () => {
    const { resolveReadableFileTypeLabel } = DesktopAttachmentPresentationRuntime;

    expect(resolveReadableFileTypeLabel('notes.txt')).toBe('TXT');
    expect(resolveReadableFileTypeLabel(' archive.tar.gz ')).toBe('GZ');
    expect(resolveReadableFileTypeLabel('README')).toBe('FILE');
    expect(resolveReadableFileTypeLabel('trailing.')).toBe('FILE');
    expect(resolveReadableFileTypeLabel('file.reallylongextension')).toBe('REALLYLO');
    expect(resolveReadableFileTypeLabel(null)).toBe('FILE');
  });
});
