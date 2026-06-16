/** @jest-environment node */

const path = require('path');
const { findDocs, loadDocsIndex } = require('../../scripts/windie/docs.cjs');

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

  test('returns the top ten docs matches by default', () => {
    expect(findDocs('runtime')).toHaveLength(10);
  });

  test('prioritizes provider model catalog docs over broad sidecar catalog matches', () => {
    const matches = findDocs('model catalog');
    const paths = matches.map((match) => match.path);

    expect(paths.indexOf(path.join('docs', 'providers', 'model_catalog_change_workflow.md'))).toBe(
      0,
    );
    expect(paths.indexOf(path.join('docs', 'frontend', 'sidecar', 'tool_catalog_and_execution_model.md'))).toBeGreaterThan(
      0,
    );
  });

  test('uses headings so MCP result contract queries find the MCP runtime first', () => {
    const matches = findDocs('mcp tool result');

    expect(matches[0]).toMatchObject({
      path: path.join('docs', 'development', 'mcp.md'),
      title: 'MCP Runtime',
    });
  });

  test('keeps current workflow docs ahead of historical plans for feature queries', () => {
    const paths = findDocs('workspace context')
      .slice(0, 3)
      .map((match) => match.path);

    expect(paths).toContain(
      path.join('docs', 'frontend', 'runtime', 'workspace_context_change_workflow.md'),
    );
    expect(paths.some((docPath) => docPath.includes(`${path.sep}refactors${path.sep}`))).toBe(
      false,
    );
  });
});
