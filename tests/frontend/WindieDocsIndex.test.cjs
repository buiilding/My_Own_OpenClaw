/** @jest-environment node */

const path = require('path');
const { loadDocsIndex } = require('../../scripts/windie/docs.cjs');

const repoRoot = path.resolve(__dirname, '../..');

describe('windie docs index', () => {
  test('resolves the canonical README page to docs/README.md', () => {
    const docs = loadDocsIndex();
    const readme = docs.find((doc) => doc.page === 'README');

    expect(readme).toMatchObject({
      page: 'README',
      path: path.join('docs', 'README.md'),
    });
    expect(path.join(repoRoot, readme.path)).toBe(path.join(repoRoot, 'docs', 'README.md'));
  });
});
