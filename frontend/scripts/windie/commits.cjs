/**
 * Searches local git commit history for the Windie CLI.
 */

const { REPO_ROOT } = require('./paths.cjs');
const { capture } = require('./run.cjs');

const DEFAULT_COMMIT_SEARCH_LIMIT = 10;
const DEFAULT_COMMIT_SCAN_LIMIT = 1000;
const MAX_COMMIT_SEARCH_LIMIT = 100;
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function normalizeCommitSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePositiveInteger(value, { fallback, maximum, optionName }) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return Math.min(Number(value), maximum);
}

function parseCommitMetadata(output) {
  return String(output || '')
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record, order) => {
      const [hash, shortHash, date, author, subject, ...bodyParts] = record.split(FIELD_SEPARATOR);
      return {
        hash: String(hash || '').trim(),
        shortHash: String(shortHash || '').trim(),
        date: String(date || '').trim(),
        author: String(author || '').trim(),
        subject: String(subject || '').trim(),
        body: bodyParts.join(FIELD_SEPARATOR).trim(),
        paths: [],
        order,
      };
    })
    .filter((commit) => commit.hash);
}

function parseCommitPaths(output) {
  const pathsByHash = new Map();
  for (const rawRecord of String(output || '').split(RECORD_SEPARATOR)) {
    const lines = rawRecord
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const hash = lines.shift();
    if (!hash) {
      continue;
    }
    pathsByHash.set(hash, lines);
  }
  return pathsByHash;
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

function scoreCommit(commit, query) {
  const { terms, phrase } = query;
  const fields = {
    hash: normalizeCommitSearchText(`${commit.hash} ${commit.shortHash}`),
    date: normalizeCommitSearchText(commit.date),
    author: normalizeCommitSearchText(commit.author),
    subject: normalizeCommitSearchText(commit.subject),
    body: normalizeCommitSearchText(commit.body),
    paths: normalizeCommitSearchText(commit.paths.join(' ')),
  };
  const allText = normalizeCommitSearchText(Object.values(fields).join(' '));
  let score = 0;

  if (phrase && terms.length > 1) {
    if (fields.hash.includes(phrase)) {
      score += 80;
    }
    if (fields.subject.includes(phrase)) {
      score += 60;
    }
    if (fields.paths.includes(phrase)) {
      score += 45;
    }
    if (fields.body.includes(phrase)) {
      score += 35;
    }
    if (fields.author.includes(phrase)) {
      score += 20;
    }
  }

  score += countFieldScore(fields.hash, terms, 20);
  score += countFieldScore(fields.subject, terms, 10);
  score += countFieldScore(fields.paths, terms, 8);
  score += countFieldScore(fields.body, terms, 5);
  score += countFieldScore(fields.author, terms, 3);
  score += countFieldScore(fields.date, terms, 1);

  if (terms.every((term) => allText.includes(term))) {
    score += 20;
  }
  if (terms.every((term) => fields.subject.includes(term))) {
    score += 14;
  }
  if (terms.every((term) => fields.paths.includes(term))) {
    score += 10;
  }
  if (terms.every((term) => fields.body.includes(term))) {
    score += 8;
  }

  return score;
}

function gitLogPathspecArgs(pathspecs = ['.']) {
  const normalized = pathspecs
    .map((pathspec) => String(pathspec || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? ['--', ...normalized] : [];
}

function loadRecentCommits({
  scanLimit = DEFAULT_COMMIT_SCAN_LIMIT,
  pathspecs = ['.'],
  captureFn = capture,
} = {}) {
  const pathspecArgs = gitLogPathspecArgs(pathspecs);
  const metadata = captureFn(
    'git',
    [
      'log',
      `--max-count=${scanLimit}`,
      '--date=short',
      `--format=${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b`,
      ...pathspecArgs,
    ],
    { cwd: REPO_ROOT },
  );
  if (!metadata.ok) {
    throw new Error(metadata.stderr || metadata.error || 'Failed to read git commit history.');
  }

  const paths = captureFn(
    'git',
    [
      'log',
      `--max-count=${scanLimit}`,
      `--format=${RECORD_SEPARATOR}%H`,
      '--name-only',
      ...pathspecArgs,
    ],
    { cwd: REPO_ROOT },
  );
  if (!paths.ok) {
    throw new Error(paths.stderr || paths.error || 'Failed to read git commit paths.');
  }

  const pathsByHash = parseCommitPaths(paths.stdout);
  return parseCommitMetadata(metadata.stdout).map((commit) => ({
    ...commit,
    paths: pathsByHash.get(commit.hash) || [],
  }));
}

function findCommits(topic, options = {}) {
  const phrase = normalizeCommitSearchText(topic);
  const terms = phrase.split(' ').filter(Boolean);
  if (!terms.length) {
    return { query: '', limit: DEFAULT_COMMIT_SEARCH_LIMIT, scanned: 0, matches: [] };
  }

  const limit = parsePositiveInteger(options.limit, {
    fallback: DEFAULT_COMMIT_SEARCH_LIMIT,
    maximum: MAX_COMMIT_SEARCH_LIMIT,
    optionName: '--limit',
  });
  const commits = options.commits || loadRecentCommits({ scanLimit: options.scanLimit });
  const query = { phrase, terms };
  const matches = commits
    .map((commit) => ({ ...commit, score: scoreCommit(commit, query) }))
    .filter((commit) => commit.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order || a.hash.localeCompare(b.hash))
    .slice(0, limit);

  return {
    query: String(topic || '').trim(),
    limit,
    scanned: commits.length,
    matches,
  };
}

module.exports = {
  DEFAULT_COMMIT_SEARCH_LIMIT,
  findCommits,
  gitLogPathspecArgs,
  loadRecentCommits,
  normalizeCommitSearchText,
  parseCommitMetadata,
  parseCommitPaths,
  parsePositiveInteger,
  scoreCommit,
};
