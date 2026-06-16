/**
 * Runs the docs workflow for the developer CLI and automation tooling.
 */

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
    ? [repoPath('docs/README.md'), repoPath('README.md')]
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
  const headings = [...content.matchAll(/^#{1,4}\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .join(' ');
  return {
    page,
    path: path.relative(REPO_ROOT, filePath),
    title,
    summary,
    readWhen,
    headings,
    text: normalizeSearchText(`${page} ${title} ${summary} ${readWhen} ${headings}`),
  };
}

function listMarkdownFiles(dir, files = []) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
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
  return pages
    .map((page, order) => {
      const metadata = readDocMeta(page);
      return metadata ? { ...metadata, order } : null;
    })
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countFieldScore(field, terms, weight) {
  let score = 0;
  for (const term of terms) {
    if (field.includes(term)) {
      score += weight;
    }
  }
  return score;
}

function scoreDoc(doc, query) {
  const { terms, phrase } = query;
  const fields = {
    page: normalizeSearchText(doc.page),
    title: normalizeSearchText(doc.title),
    summary: normalizeSearchText(doc.summary),
    readWhen: normalizeSearchText(doc.readWhen),
    headings: normalizeSearchText(doc.headings),
    text: doc.text,
  };

  let score = 0;

  if (phrase && terms.length > 1) {
    if (fields.page.includes(phrase)) {
      score += 45;
    }
    if (fields.title.includes(phrase)) {
      score += 40;
    }
    if (fields.summary.includes(phrase)) {
      score += 32;
    }
    if (fields.headings.includes(phrase)) {
      score += 28;
    }
    if (fields.readWhen.includes(phrase)) {
      score += 20;
    }
    if (fields.text.includes(phrase)) {
      score += 10;
    }
  }

  score += countFieldScore(fields.page, terms, 7);
  score += countFieldScore(fields.title, terms, 6);
  score += countFieldScore(fields.summary, terms, 4);
  score += countFieldScore(fields.headings, terms, 3);
  score += countFieldScore(fields.readWhen, terms, 2);
  score += countFieldScore(fields.text, terms, 1);

  if (terms.every((term) => fields.text.includes(term))) {
    score += 15;
  }
  if (terms.every((term) => fields.title.includes(term))) {
    score += 12;
  }
  if (terms.every((term) => fields.summary.includes(term))) {
    score += 8;
  }
  if (terms.every((term) => fields.headings.includes(term))) {
    score += 8;
  }

  if (isHistoricalDocPath(doc.path) && !isHistoricalQuery(terms)) {
    score -= 60;
  }

  return score;
}

function isHistoricalDocPath(docPath) {
  return /(^|\/)(plans|planning|refactors)\//.test(String(docPath || ''));
}

function isHistoricalQuery(terms) {
  return terms.some((term) => ['plan', 'plans', 'planning', 'refactor', 'refactors', 'report'].includes(term));
}

const DEFAULT_DOC_SEARCH_LIMIT = 10;

function findDocs(topic, limit = DEFAULT_DOC_SEARCH_LIMIT) {
  const phrase = normalizeSearchText(topic);
  const terms = phrase
    .split(' ')
    .filter(Boolean);
  if (!terms.length) {
    return [];
  }
  const query = { phrase, terms };
  return loadDocsIndex()
    .map((doc) => ({ ...doc, score: scoreDoc(doc, query) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order || a.path.localeCompare(b.path))
    .slice(0, limit);
}

module.exports = {
  findDocs,
  loadDocsIndex,
};
