/**
 * Covers attachment presentation runtime behavior in the frontend test suite.
 */

import { resolveReadableFileTypeLabel } from '../../frontend/src/renderer/app/runtime/desktopAttachmentPresentationRuntime';

describe('desktopAttachmentPresentationRuntime', () => {
  test('resolveReadableFileTypeLabel normalizes readable file extensions', () => {
    expect(resolveReadableFileTypeLabel('notes.txt')).toBe('TXT');
    expect(resolveReadableFileTypeLabel(' archive.tar.gz ')).toBe('GZ');
    expect(resolveReadableFileTypeLabel('README')).toBe('FILE');
    expect(resolveReadableFileTypeLabel('trailing.')).toBe('FILE');
    expect(resolveReadableFileTypeLabel('file.reallylongextension')).toBe('REALLYLO');
    expect(resolveReadableFileTypeLabel(null)).toBe('FILE');
  });
});
