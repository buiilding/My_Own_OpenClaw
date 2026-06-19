/**
 * Runs the docs workflow for the developer CLI and automation tooling.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, repoPath } = require('./paths.cjs');

let cachedDocsIndex = null;

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
  const body = content.replace(/^---\n[\s\S]*?\n---/, '');
  const searchFields = buildSearchFields({
    page,
    title,
    summary,
    readWhen,
    headings,
    body,
  });
  return {
    page,
    path: path.relative(REPO_ROOT, filePath),
    title,
    summary,
    readWhen,
    headings,
    body,
    text: searchFields.text,
    searchFields,
  };
}

function buildSearchFields({
  page = '',
  title = '',
  summary = '',
  readWhen = '',
  headings = '',
  body = '',
} = {}) {
  const fields = {
    page: normalizeSearchText(page),
    title: normalizeSearchText(title),
    summary: normalizeSearchText(summary),
    readWhen: normalizeSearchText(readWhen),
    headings: normalizeSearchText(headings),
    body: normalizeSearchText(body),
  };
  const text = normalizeSearchText([
    fields.page,
    fields.title,
    fields.summary,
    fields.readWhen,
    fields.headings,
    fields.body,
  ].join(' '));
  const searchFields = {
    ...fields,
    text,
  };
  return Object.freeze({
    ...searchFields,
    tokens: Object.freeze(Object.fromEntries(
      Object.entries(searchFields).map(([fieldName, field]) => [
        fieldName,
        Object.freeze(field.split(' ').filter(Boolean)),
      ]),
    )),
  });
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

function buildDocsIndex() {
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

function getDocsIndex({ refresh = false } = {}) {
  if (refresh || !cachedDocsIndex) {
    cachedDocsIndex = buildDocsIndex();
  }
  return cachedDocsIndex;
}

function toPublicDoc(doc) {
  const { searchFields: _searchFields, ...publicDoc } = doc;
  return { ...publicDoc };
}

function loadDocsIndex(options = {}) {
  return getDocsIndex(options).map(toPublicDoc);
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fieldHasTerm(field, term, tokens = null) {
  if (!field || !term) {
    return false;
  }
  const fieldTokens = tokens || field.split(' ').filter(Boolean);
  return fieldTokens.some((token) => {
    if (token === term) {
      return true;
    }
    if (term.length > 3 && token === `${term}s`) {
      return true;
    }
    if (token.length > 3 && term === `${token}s`) {
      return true;
    }
    return false;
  });
}

function countFieldScore(field, terms, weight, tokens = null) {
  let score = 0;
  for (const term of terms) {
    if (fieldHasTerm(field, term, tokens)) {
      score += weight;
    }
  }
  return score;
}

function queryTermPairs(terms) {
  const pairs = [];
  for (let index = 0; index < terms.length - 1; index += 1) {
    pairs.push(`${terms[index]} ${terms[index + 1]}`);
  }
  return pairs;
}

function countPairScore(field, pairs, weight) {
  let score = 0;
  for (const pair of pairs) {
    if (field.includes(pair)) {
      score += weight;
    }
  }
  return score;
}

function scoreDoc(doc, query) {
  const { terms, phrase } = query;
  const pairs = queryTermPairs(terms);
  const fields = doc.searchFields || buildSearchFields(doc);

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
    if (fields.body.includes(phrase)) {
      score += 12;
    }
    if (fields.text.includes(phrase)) {
      score += 10;
    }
  }

  score += countFieldScore(fields.page, terms, 7, fields.tokens?.page);
  score += countFieldScore(fields.title, terms, 6, fields.tokens?.title);
  score += countFieldScore(fields.summary, terms, 4, fields.tokens?.summary);
  score += countFieldScore(fields.headings, terms, 3, fields.tokens?.headings);
  score += countFieldScore(fields.readWhen, terms, 2, fields.tokens?.readWhen);
  score += countFieldScore(fields.body, terms, 2, fields.tokens?.body);
  score += countFieldScore(fields.text, terms, 1, fields.tokens?.text);

  score += countPairScore(fields.page, pairs, 18);
  score += countPairScore(fields.title, pairs, 16);
  score += countPairScore(fields.summary, pairs, 12);
  score += countPairScore(fields.headings, pairs, 10);
  score += countPairScore(fields.readWhen, pairs, 8);
  score += countPairScore(fields.body, pairs, 6);
  score += countPairScore(fields.text, pairs, 5);

  if (terms.every((term) => fieldHasTerm(fields.text, term, fields.tokens?.text))) {
    score += 15;
  }
  if (terms.every((term) => fieldHasTerm(fields.title, term, fields.tokens?.title))) {
    score += 12;
  }
  if (terms.every((term) => fieldHasTerm(fields.summary, term, fields.tokens?.summary))) {
    score += 8;
  }
  if (terms.every((term) => fieldHasTerm(fields.headings, term, fields.tokens?.headings))) {
    score += 8;
  }
  if (terms.every((term) => fieldHasTerm(fields.body, term, fields.tokens?.body))) {
    score += 6;
  }

  if (terms.length === 1 && isHubDoc(doc, fields)) {
    score += 8;
  }

  if (isHistoricalDocPath(doc.path) && !isHistoricalQuery(terms)) {
    score -= 60;
  }

  if (isDecisionRecordPath(doc.path) && !isDecisionRecordQuery(terms)) {
    score -= 20;
  }

  return score;
}

function isHistoricalDocPath(docPath) {
  return /(^|\/)(plans|planning|refactors)\//.test(normalizeDocPath(docPath));
}

function isDecisionRecordPath(docPath) {
  return /(^|\/)adr\//.test(normalizeDocPath(docPath));
}

function isHubDoc(doc, fields) {
  return normalizeDocPath(doc.path).endsWith('/README.md') && (
    fields.title.includes('hub') || fields.summary.includes('hub') || fields.headings.includes('hub')
  );
}

function normalizeDocPath(docPath) {
  return String(docPath || '').replace(/\\/g, '/');
}

function isHistoricalQuery(terms) {
  return terms.some((term) => ['plan', 'plans', 'planning', 'refactor', 'refactors', 'report'].includes(term));
}

function isDecisionRecordQuery(terms) {
  return terms.some((term) => ['adr', 'decision', 'decisions', 'record', 'records'].includes(term));
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
  return getDocsIndex()
    .map((doc) => ({ ...toPublicDoc(doc), score: scoreDoc(doc, query) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order || a.path.localeCompare(b.path))
    .slice(0, limit);
}

module.exports = {
  findDocs,
  loadDocsIndex,
};
