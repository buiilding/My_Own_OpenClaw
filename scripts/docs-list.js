#!/usr/bin/env node
/**
 * Runs the docs list workflow for the developer CLI and automation tooling.
 */

const fs = require("node:fs");
const path = require("node:path");

process.stdout.on("error", (error) => {
  if (error && error.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");

if (!fs.existsSync(docsDir)) {
  console.error("docs:list: missing docs directory in windieos repo.");
  process.exit(1);
}

if (!fs.statSync(docsDir).isDirectory()) {
  console.error("docs:list: docs path is not a directory.");
  process.exit(1);
}

const excludedDirs = new Set(["archive", "research"]);
const canonicalNavPath = path.join(docsDir, "docs.json");

function compactStrings(values) {
  const result = [];
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    const normalized =
      typeof value === "string"
        ? value.trim()
        : typeof value === "number" || typeof value === "boolean"
          ? String(value).trim()
          : null;
    if (normalized && normalized.length > 0) {
      result.push(normalized);
    }
  }
  return result;
}

function walkMarkdownFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) {
        continue;
      }
      files.push(...walkMarkdownFiles(fullPath, base));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(normalizeRelativeMarkdownPath(path.relative(base, fullPath)));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeRelativeMarkdownPath(relativePath) {
  return String(relativePath).replace(/\\/g, "/");
}

function extractMetadata(fullPath) {
  const content = fs.readFileSync(fullPath, "utf8");
  if (!content.startsWith("---")) {
    return { summary: null, readWhen: [], error: "missing front matter" };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { summary: null, readWhen: [], error: "unterminated front matter" };
  }

  const frontMatter = content.slice(3, endIndex).trim();
  const lines = frontMatter.split("\n");

  let summaryLine = null;
  const readWhen = [];
  let collectingField = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("summary:")) {
      summaryLine = line;
      collectingField = null;
      continue;
    }

    if (line.startsWith("read_when:")) {
      collectingField = "read_when";
      const inline = line.slice("read_when:".length).trim();
      if (inline.startsWith("[") && inline.endsWith("]")) {
        try {
          const parsed = JSON.parse(inline.replace(/'/g, "\""));
          if (Array.isArray(parsed)) {
            readWhen.push(...compactStrings(parsed));
          }
        } catch {
          // Keep behavior permissive for malformed inline arrays.
        }
      }
      continue;
    }

    if (collectingField === "read_when") {
      if (line.startsWith("- ")) {
        const hint = line.slice(2).trim();
        if (hint) {
          readWhen.push(hint);
        }
      } else if (line !== "") {
        collectingField = null;
      }
    }
  }

  if (!summaryLine) {
    return { summary: null, readWhen, error: "summary key missing" };
  }

  const summaryValue = summaryLine.slice("summary:".length).trim();
  const normalized = summaryValue
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return { summary: null, readWhen, error: "summary is empty" };
  }

  return { summary: normalized, readWhen };
}

function collectNavPages(value, pages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNavPages(item, pages);
    }
    return pages;
  }
  if (!value || typeof value !== "object") {
    return pages;
  }
  if (Array.isArray(value.pages)) {
    for (const page of value.pages) {
      if (typeof page === "string" && page.trim()) {
        pages.push(page.trim());
      }
    }
  }
  for (const child of Object.values(value)) {
    collectNavPages(child, pages);
  }
  return pages;
}

function normalizeNavPagePath(page) {
  const normalized = page.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.endsWith(".md")) {
    return normalized;
  }
  return `${normalized}.md`;
}

function validateCanonicalNavigation(markdownFiles) {
  if (!fs.existsSync(canonicalNavPath)) {
    console.error("docs:list: missing canonical docs navigation docs/docs.json.");
    process.exitCode = 1;
    return;
  }

  let nav;
  try {
    nav = JSON.parse(fs.readFileSync(canonicalNavPath, "utf8"));
  } catch (error) {
    console.error(`docs:list: invalid docs/docs.json: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const knownMarkdownFiles = new Set(markdownFiles);
  const pages = collectNavPages(nav.navigation ?? nav);
  const missingPages = [];
  for (const page of pages) {
    const markdownPath = normalizeNavPagePath(page);
    if (!knownMarkdownFiles.has(markdownPath)) {
      missingPages.push(`${page} -> ${markdownPath}`);
    }
  }

  if (missingPages.length > 0) {
    console.error("docs:list: docs/docs.json references missing pages:");
    for (const missing of missingPages) {
      console.error(`  - ${missing}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Canonical navigation: docs/docs.json (${pages.length} page references validated)`,
  );
}

function main() {
  console.log("Listing all markdown files in docs folder:");

  const markdownFiles = walkMarkdownFiles(docsDir);
  validateCanonicalNavigation(markdownFiles);
  for (const relativePath of markdownFiles) {
    const fullPath = path.join(docsDir, relativePath);
    const { summary, readWhen, error } = extractMetadata(fullPath);
    if (summary) {
      console.log(`${relativePath} - ${summary}`);
      if (readWhen.length > 0) {
        console.log(`  Read when: ${readWhen.join("; ")}`);
      }
    } else {
      const reason = error ? ` - [${error}]` : "";
      console.log(`${relativePath}${reason}`);
    }
  }

  console.log(
    '\nReminder: keep docs up to date as behavior changes. When your task matches any "Read when" hint above (React hooks, cache directives, database work, tests, etc.), read that doc before coding, and suggest new coverage when it is missing.',
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  normalizeNavPagePath,
  normalizeRelativeMarkdownPath,
};
