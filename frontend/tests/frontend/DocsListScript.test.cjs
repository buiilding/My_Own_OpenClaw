/** @jest-environment node */

const {
  normalizeNavPagePath,
  normalizeRelativeMarkdownPath,
} = require('../../scripts/docs-list.js');

describe('docs-list script path normalization', () => {
  test('compares Windows-discovered markdown paths to canonical docs navigation paths', () => {
    expect(normalizeRelativeMarkdownPath('getting-started\\docs_directory.md')).toBe(
      'getting-started/docs_directory.md',
    );
    expect(normalizeRelativeMarkdownPath('architecture\\runtime_boundary_matrix.md')).toBe(
      'architecture/runtime_boundary_matrix.md',
    );
    expect(normalizeNavPagePath('getting-started/docs_directory')).toBe(
      'getting-started/docs_directory.md',
    );
  });
});
