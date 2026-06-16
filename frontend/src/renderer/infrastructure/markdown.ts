/**
 * Provides the markdown module for the renderer UI.
 */

import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

const MARKED_OPTIONS = {
  gfm: true,
  breaks: true,
  mangle: false,
};

const markedRenderer = new Marked(MARKED_OPTIONS);
const markedRendererWithMath = new Marked(MARKED_OPTIONS);
markedRendererWithMath.use(markedKatex({
  throwOnError: false,
  displayMode: false,
  nonStandard: true,
}));

const allowedTags = [
  'a',
  'annotation',
  'annotation-xml',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'math',
  'mark',
  'mi',
  'mn',
  'mo',
  'mrow',
  'msqrt',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'mover',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'semantics',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const allowedAttrs = [
  'aria-hidden',
  'class',
  'data-thread-find-active',
  'data-thread-find-match-index',
  'encoding',
  'href',
  'rel',
  'start',
  'style',
  'target',
  'title',
  'xmlns',
];

const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;

const markdownCache = new Map<string, string>();
let hooksInstalled = false;

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    const href = node.getAttribute('href');
    if (!href) {
      return;
    }
    node.setAttribute('rel', 'noreferrer noopener');
    node.setAttribute('target', '_blank');
  });
}

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

function truncateText(value: string, max: number) {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type MarkdownRenderOptions = {
  enableMath?: boolean;
};

type TextMatch = {
  end: number;
  index: number;
  start: number;
};

function normalizeFindQuery(query: string): string {
  return typeof query === 'string' ? query.trim() : '';
}

function buildHighlightClassName(active: boolean): string {
  return active ? 'thread-find-match is-active' : 'thread-find-match';
}

function buildMatchMarkup(content: string, matchIndex: number, active: boolean): string {
  return [
    `<mark class="${buildHighlightClassName(active)}"`,
    ` data-thread-find-match-index="${matchIndex}"`,
    ` data-thread-find-active="${active ? 'true' : 'false'}">`,
    content,
    '</mark>',
  ].join('');
}

function createHtmlContainer(sourceHtml: string): HTMLDivElement | null {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const container = document.createElement('div');
    container.innerHTML = sourceHtml;
    return container;
  }

  if (typeof window !== 'undefined' && typeof window.DOMParser === 'function') {
    const parser = new window.DOMParser();
    const parsed = parser.parseFromString(`<div>${sourceHtml}</div>`, 'text/html');
    return parsed.body.firstElementChild as HTMLDivElement | null;
  }

  return null;
}

export function collectTextMatches(text: string, query: string): TextMatch[] {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeFindQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const haystack = text.toLocaleLowerCase();
  const needle = normalizedQuery.toLocaleLowerCase();
  const matches: TextMatch[] = [];
  let cursor = 0;

  while (cursor < haystack.length) {
    const matchStart = haystack.indexOf(needle, cursor);
    if (matchStart < 0) {
      break;
    }
    matches.push({
      index: matches.length,
      start: matchStart,
      end: matchStart + needle.length,
    });
    cursor = matchStart + Math.max(needle.length, 1);
  }

  return matches;
}

export function extractTextFromHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) {
    return '';
  }

  const container = createHtmlContainer(html);
  if (!container) {
    return html.replace(/<[^>]+>/g, ' ');
  }

  return container.textContent || '';
}

export function highlightPlainTextToHtml(
  text: string,
  query: string,
  globalMatchIndexes: number[] = [],
  activeMatchIndex: number | null = null,
): string {
  const normalizedText = typeof text === 'string' ? text : '';
  const matches = collectTextMatches(normalizedText, query);
  if (matches.length === 0) {
    return escapeHtml(normalizedText);
  }

  let cursor = 0;
  let html = '';

  matches.forEach((match, localMatchIndex) => {
    const globalMatchIndex = globalMatchIndexes[localMatchIndex] ?? match.index;
    const active = activeMatchIndex === globalMatchIndex;
    if (match.start > cursor) {
      html += escapeHtml(normalizedText.slice(cursor, match.start));
    }
    html += buildMatchMarkup(
      escapeHtml(normalizedText.slice(match.start, match.end)),
      globalMatchIndex,
      active,
    );
    cursor = match.end;
  });

  if (cursor < normalizedText.length) {
    html += escapeHtml(normalizedText.slice(cursor));
  }

  return html;
}

export function highlightSanitizedHtml(
  html: string,
  query: string,
  globalMatchIndexes: number[] = [],
  activeMatchIndex: number | null = null,
): string {
  if (typeof html !== 'string' || html.length === 0) {
    return '';
  }

  const normalizedQuery = normalizeFindQuery(query);
  if (!normalizedQuery) {
    return html;
  }

  const container = createHtmlContainer(html);
  if (!container) {
    return html;
  }

  const ownerDocument = container.ownerDocument || document;
  const walker = ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Array<{ end: number; node: Text; start: number }> = [];
  let currentNode = walker.nextNode();
  let cursor = 0;

  while (currentNode) {
    const node = currentNode as Text;
    const value = node.nodeValue || '';
    if (value.length > 0) {
      textNodes.push({
        node,
        start: cursor,
        end: cursor + value.length,
      });
      cursor += value.length;
    }
    currentNode = walker.nextNode();
  }

  const matches = collectTextMatches(container.textContent || '', normalizedQuery);
  if (matches.length === 0) {
    return html;
  }

  textNodes.forEach(({ node, start: nodeStart, end: nodeEnd }) => {
    const nodeValue = node.nodeValue || '';
    const overlappingMatches = matches.filter((match) => match.start < nodeEnd && match.end > nodeStart);
    if (overlappingMatches.length === 0 || !node.parentNode) {
      return;
    }

    const fragment = ownerDocument.createDocumentFragment();
    let localCursor = 0;

    overlappingMatches.forEach((match, localMatchIndex) => {
      const overlapStart = Math.max(0, match.start - nodeStart);
      const overlapEnd = Math.min(nodeValue.length, match.end - nodeStart);
      const globalMatchIndex = globalMatchIndexes[match.index] ?? match.index;
      const active = activeMatchIndex === globalMatchIndex;

      if (overlapStart > localCursor) {
        fragment.appendChild(ownerDocument.createTextNode(nodeValue.slice(localCursor, overlapStart)));
      }

      const mark = ownerDocument.createElement('mark');
      mark.className = buildHighlightClassName(active);
      mark.setAttribute('data-thread-find-match-index', String(globalMatchIndex));
      mark.setAttribute('data-thread-find-active', active ? 'true' : 'false');
      mark.textContent = nodeValue.slice(overlapStart, overlapEnd);
      fragment.appendChild(mark);

      localCursor = Math.max(localCursor, overlapEnd);
      void localMatchIndex;
    });

    if (localCursor < nodeValue.length) {
      fragment.appendChild(ownerDocument.createTextNode(nodeValue.slice(localCursor)));
    }

    node.parentNode.replaceChild(fragment, node);
  });

  return container.innerHTML;
}

export function toSanitizedMarkdownHtml(markdown: string, options: MarkdownRenderOptions = {}): string {
  const input = markdown.trim();
  if (!input) {
    return '';
  }

  installHooks();

  const cacheKey = `${options.enableMath === false ? 'plain' : 'math'}:${input}`;
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : '';

  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    const html = `<pre class="code-block">${escaped}</pre>`;
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
    });
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(cacheKey, sanitized);
    }
    return sanitized;
  }

  const parser = options.enableMath === false ? markedRenderer : markedRendererWithMath;
  const rendered = parser.parse(`${truncated.text}${suffix}`) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttrs,
  });

  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(cacheKey, sanitized);
  }

  return sanitized;
}
