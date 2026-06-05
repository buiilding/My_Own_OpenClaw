const fs = require('fs');
const path = require('path');
const { REPO_ROOT, repoPath } = require('./paths.cjs');

function flattenPagesFromDocsJson(value, pages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenPagesFromDocsJson(item, pages);
    }
    return pages;
  }
  if (!value || typeof value !== 'object') {
    return pages;
  }
  if (Array.isArray(value.pages)) {
    for (const page of value.pages) {
      if (typeof page === 'string') {
        pages.push(page);
      } else {
        flattenPagesFromDocsJson(page, pages);
      }
    }
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') {
      flattenPagesFromDocsJson(nested, pages);
    }
  }
  return pages;
}

function readDocMeta(page) {
  const candidates = page === 'README'
    ? [repoPath('README.md'), repoPath('docs/README.md')]
    : [repoPath('docs', `${page}.md`), repoPath('docs', `${page}.mdx`)];
  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const title = (frontmatter?.[1].match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ||
    content.match(/^#\s+(.+)$/m)?.[1] ||
    page).trim();
  const summary = (frontmatter?.[1].match(/^summary:\s*"?([^"\n]+)"?/m)?.[1] || '').trim();
  const readWhen = [...content.matchAll(/^\s*-\s+When\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .join(' ');
  return {
    page,
    path: path.relative(REPO_ROOT, filePath),
    title,
    summary,
    text: `${page} ${title} ${summary} ${readWhen}`.toLowerCase(),
  };
}

function listMarkdownFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMarkdownFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function pageFromDocPath(filePath) {
  if (filePath === repoPath('README.md')) {
    return 'README';
  }
  const relative = path.relative(repoPath('docs'), filePath).replace(/\\/g, '/');
  return relative.replace(/\.(md|mdx)$/i, '');
}

function loadDocsIndex() {
  const docsJson = JSON.parse(fs.readFileSync(repoPath('docs/docs.json'), 'utf8'));
  const discoveredPages = [
    repoPath('README.md'),
    ...listMarkdownFiles(repoPath('docs')),
  ].map(pageFromDocPath);
  const pages = [...new Set([...flattenPagesFromDocsJson(docsJson), ...discoveredPages])];
  return pages.map(readDocMeta).filter(Boolean);
}

function scoreDoc(doc, terms) {
  let score = 0;
  for (const term of terms) {
    if (!term) {
      continue;
    }
    if (doc.page.toLowerCase().includes(term)) {
      score += 5;
    }
    if (doc.title.toLowerCase().includes(term)) {
      score += 4;
    }
    if (doc.summary.toLowerCase().includes(term)) {
      score += 3;
    }
    if (doc.text.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function findDocs(topic, limit = 5) {
  const terms = String(topic || '')
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter(Boolean);
  if (!terms.length) {
    return [];
  }
  return loadDocsIndex()
    .map((doc) => ({ ...doc, score: scoreDoc(doc, terms) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

module.exports = {
  findDocs,
  loadDocsIndex,
};
